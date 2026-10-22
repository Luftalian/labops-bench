"""On-demand articulated access audit for arbitrary v2 layouts.

This is a kinematic audit, not a dynamics / manipulation certificate. It imports
the pinned official xArm6 model, tests position + tool approach direction and
sampled joint-space collision against dimensioned instrument boxes. Other arms
are represented by their mounts; simultaneous moving-arm interaction is not
certified. Failed searches remain failed evidence, not an infeasibility proof.
Input JSON on stdin: {layout, task, catalog}. JSON report on stdout.
"""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import numpy as np
import mujoco
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parent
PHYSICS = ROOT.parent / 'physics'
ASSET = PHYSICS / 'assets/xarm6'
ASSETS = {p.name: p.read_bytes() for p in ASSET.rglob('*') if p.suffix in ('.stl', '.obj', '.mtl')}
BASE = ET.parse(PHYSICS / 'converted.xml').getroot()
HASH = lambda b: hashlib.sha256(b).hexdigest()


def rotate(v, degrees):
    a = np.deg2rad(degrees)
    return np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]]) @ np.array(v[:2])


def build_scene(data, arm):
    root = ET.fromstring(ET.tostring(BASE))
    world = root.find('worldbody')
    base = world.find('body')
    base.set('pos', f'{arm["x"]} {arm["y"]} {data["catalog"]["robot"]["mount_height_m"]}')
    ET.SubElement(base.find('.//body[@name="link6"]'), 'site', {'name': 'tool', 'pos': '0 0 .06', 'size': '.012'})
    contact = ET.SubElement(root, 'contact')
    ET.SubElement(contact, 'exclude', {'body1': 'link_base', 'body2': 'link1'})
    ET.SubElement(world, 'geom', {'name': 'floor', 'type': 'plane', 'size': '30 30 .1'})
    for r in data['layout']['robots']:
        # A mount, not a fictitious parked articulated-arm collision certificate.
        ET.SubElement(world, 'geom', {'name': 'mount-' + r['id'], 'type': 'cylinder', 'pos': f'{r["x"]} {r["y"]} .38', 'size': '.13 .38'})
    for device in data['layout']['devices']:
        model = data['catalog']['equipment'][device['model']]
        w, depth, height = model['size_m']
        ET.SubElement(world, 'geom', {'name': device['id'], 'type': 'box', 'pos': f'{device["x"]} {device["y"]} {model["mount_height_m"] + height/2}', 'size': f'{w/2} {depth/2} {height/2}', 'euler': f'0 0 {np.deg2rad(device["rotation"])}'})
        if model['mount_height_m']:
            ET.SubElement(world, 'geom', {'name': 'bench-' + device['id'], 'type': 'box', 'pos': f'{device["x"]} {device["y"]} {model["mount_height_m"]-.025}', 'size': f'{w/2} {depth/2} .025', 'euler': f'0 0 {np.deg2rad(device["rotation"])}'})
    for i, o in enumerate(data['task']['room'].get('obstacles', [])):
        ET.SubElement(world, 'geom', {'name': 'obstacle-' + str(i), 'type': 'box', 'pos': f'{o["x"]+o["w"]/2} {o["y"]+o["h"]/2} .8', 'size': f'{o["w"]/2} {o["h"]/2} .8'})
    return mujoco.MjModel.from_xml_string(ET.tostring(root, encoding='unicode'), assets=ASSETS)


def collisions(model, state):
    bad = []
    for c in state.contact:
        if c.dist < -.0005:
            bad.append(float(-c.dist))
    return bad


def audit_arm(data, arm):
    m = build_scene(data, arm)
    d = mujoco.MjData(m)
    site = m.site('tool').id
    lo, hi = m.jnt_range[:, 0] + .001, m.jnt_range[:, 1] - .001
    rng = np.random.default_rng(20261021)
    seeds = [np.array([a, -.4, -1.2, 0, 1.4, 0]) for a in [0, 1.5, -1.5, 3]]

    def solve(target, direction=None, prior=None, all_solutions=False):
        def residual(q):
            d.qpos[:] = q
            mujoco.mj_forward(m, d)
            position = d.site_xpos[site] - target
            if direction is None:
                return position
            axis = d.site_xmat[site].reshape(3, 3)[:, 2]
            return np.r_[position, (axis-direction)*.12]
        candidates = []
        for seed in ([prior] if prior is not None else []) + seeds:
            opt = least_squares(residual, np.clip(seed, lo, hi), bounds=(lo, hi), max_nfev=160, ftol=1e-8, xtol=1e-8, gtol=1e-8)
            residual(opt.x)
            error = float(np.linalg.norm(d.site_xpos[site]-target))
            cosine = float(np.dot(d.site_xmat[site].reshape(3, 3)[:, 2], direction)) if direction is not None else 1.
            if error < .003 and cosine > .9 and not collisions(m, d):
                candidate = (opt.x.copy(), error, cosine)
                if not all_solutions:
                    return candidate
                if not any(np.linalg.norm(opt.x-c[0]) < .05 for c in candidates):
                    candidates.append(candidate)
        candidates.sort(key=lambda c: np.linalg.norm(c[0]-(prior if prior is not None else seeds[0])))
        return candidates if all_solutions else None

    def valid(q):
        d.qpos[:] = q
        mujoco.mj_forward(m, d)
        return not collisions(m, d)

    def edge(a, b):
        return all(valid(a+(b-a)*f) for f in np.linspace(0, 1, max(2, int(np.max(np.abs(b-a))/.05)+2)))

    def path(start, goal):
        if edge(start, goal):
            return [start, goal]
        # Bounded, deterministic bidirectional RRT. Search exhaustion is reported.
        trees = [([start], [-1]), ([goal], [-1])]
        swapped = False
        def extend(tree, target):
            nodes, parents = tree
            i = int(np.argmin(np.linalg.norm(np.array(nodes)-target, axis=1)))
            delta = target-nodes[i]
            length = np.linalg.norm(delta)
            q = nodes[i]+delta*min(1, .3/max(length, 1e-9))
            if not edge(nodes[i], q):
                return None, False
            nodes.append(q)
            parents.append(i)
            return len(nodes)-1, length <= .3
        def trace(tree, index):
            route = []
            while index >= 0:
                route.append(tree[0][index])
                index = tree[1][index]
            return route[::-1]
        for iteration in range(1500):
            target = trees[1][0][0] if iteration % 5 == 0 else rng.uniform(np.maximum(lo, -np.pi), np.minimum(hi, np.pi))
            a, _ = extend(trees[0], target)
            if a is not None:
                for _ in range(40):
                    b, reached = extend(trees[1], trees[0][0][a])
                    if b is None:
                        break
                    if reached:
                        route = trace(trees[0], a)+trace(trees[1], b)[::-1][1:]
                        return route[::-1] if swapped else route
            trees.reverse()
            swapped = not swapped
        return None

    offset = rotate(data['catalog']['robot']['handoff_offset_m'], arm.get('yaw', 0))
    home = solve(np.array([arm['x']+offset[0], arm['y']+offset[1], 1.0]))
    results = []
    for device in data['layout']['devices']:
        model = data['catalog']['equipment'][device['model']]
        for kind in ['input', 'output']:
            if device[kind+'_robot_id'] != arm['id']:
                continue
            p = model['ports'][kind]
            xy = rotate(p['point_m'], device['rotation'])+np.array([device['x'], device['y']])
            normal = rotate(p['normal'], device['rotation'])
            top = p['approach'] == 'top'
            # Deliberately outside the body: access audit does not pretend to insert a sample.
            target = np.r_[xy + (np.array([0., 0.]) if top else normal*.10), max(p['point_m'][2], model['mount_height_m']+model['size_m'][2]+.08) if top else p['point_m'][2]]
            direction = np.array([0., 0., -1.]) if top else np.r_[-normal, 0.]
            candidates = solve(target, direction, home[0] if home else None, all_solutions=True)
            solution = candidates[0] if candidates else None
            route = None
            if home:
                for candidate in candidates:
                    route = path(home[0], candidate[0])
                    if route:
                        solution = candidate
                        break
            status = 'passed' if route else 'failed'
            reason = None if route else 'No collision-free handoff IK' if not home else 'No collision-free oriented target IK' if not solution else 'Bounded joint-space planner exhausted'
            frames = []
            if route:
                for a, b in zip(route, route[1:]):
                    for f in np.linspace(0, 1, max(2, int(np.max(np.abs(b-a))/.05)+2)):
                        frames.append((a+(b-a)*f).tolist())
            results.append({'robot_id': arm['id'], 'device_id': device['id'], 'port': kind, 'status': status, 'reason': reason, 'target_m': target.tolist(), 'tool_direction': direction.tolist(), 'position_error_m': solution[1] if solution else None, 'approach_cos': solution[2] if solution else None, 'q_rad': frames})
    return results


def main():
    raw = sys.stdin.buffer.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('Input limit 2 MB')
    data = json.loads(raw)
    motions = [motion for arm in data['layout']['robots'] for motion in audit_arm(data, arm)]
    report = {'schema_version': 'labops.articulated-access.v2', 'engine': 'MuJoCo '+mujoco.__version__, 'input_sha256': HASH(raw), 'generator_sha256': HASH(Path(__file__).read_bytes()), 'assets_sha256': {str(p.relative_to(ASSET)): HASH(p.read_bytes()) for p in ASSET.rglob('*') if p.is_file()}, 'urdf_sha256': HASH((ASSET/'xarm6.urdf').read_bytes()), 'converted_model_sha256': HASH((PHYSICS/'converted.xml').read_bytes()), 'scope': 'Sequential collision-aware oriented access checks; not sample insertion, grasping, dynamics or simultaneous articulated arms.', 'assumptions': ['Official pinned xArm6; balanced upstream inertia conversion retained', 'Hypothetical 60 mm tool; 100 mm front approach offset or top clearance', 'Instrument and bench boxes, mount obstacles; other articulated arms are not included', '3 mm position tolerance, approach cosine > 0.9; joint edges sampled at <= 0.05 rad', 'No real laboratory calibration; failed IK/planning is not an infeasibility proof'], 'passed': sum(x['status']=='passed' for x in motions), 'total': len(motions), 'motions': motions}
    print(json.dumps(report))


if __name__ == '__main__':
    main()
