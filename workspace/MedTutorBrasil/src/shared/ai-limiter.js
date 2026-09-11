const MAX_CONCURRENT_AI_REQUESTS = Number(process.env.AI_MAX_CONCURRENCY || 4);

let active = 0;
const queue = [];

function drain() {
  while (active < MAX_CONCURRENT_AI_REQUESTS && queue.length > 0) {
    const { task, resolve, reject } = queue.shift();
    active += 1;
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        drain();
      });
  }
}

function runWithAiLimit(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    drain();
  });
}

module.exports = { runWithAiLimit };
