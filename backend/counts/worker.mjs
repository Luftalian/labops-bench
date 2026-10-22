import {parentPort, workerData} from 'node:worker_threads';
import {evaluateCounts} from './evaluator.mjs';
try {
  parentPort.postMessage({status: 200, body: await evaluateCounts(workerData.bundle, workerData.request)});
} catch (error) {
  parentPort.postMessage({status: 500, body: {error: 'evaluation_failed', message: error.message}});
}
