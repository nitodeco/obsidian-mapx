const debuggerBaseUrl = "http://127.0.0.1:9222";

async function findPageTarget() {
	const response = await fetch(`${debuggerBaseUrl}/json`);
	const targets = await response.json();
	const pageTarget = targets.find((target) => target.type === "page");
	if (!pageTarget) {
		throw new Error("No Obsidian page target found");
	}
	return pageTarget;
}

async function evaluateInObsidian(expression) {
	const pageTarget = await findPageTarget();
	const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			socket.close();
			reject(new Error("CDP evaluation timed out"));
		}, 30000);

		socket.onopen = () => {
			socket.send(
				JSON.stringify({
					id: 1,
					method: "Runtime.evaluate",
					params: {
						expression,
						awaitPromise: true,
						returnByValue: true,
					},
				}),
			);
		};

		socket.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.id === 1) {
				clearTimeout(timeout);
				socket.close();
				if (message.result?.exceptionDetails) {
					reject(new Error(JSON.stringify(message.result.exceptionDetails, null, 2)));
				} else {
					resolve(message.result?.result?.value);
				}
			}
		};

		socket.onerror = (error) => {
			clearTimeout(timeout);
			reject(error);
		};
	});
}

const expression = process.argv[2];
if (!expression) {
	console.error("Usage: node obsidian-eval.mjs '<js expression>'");
	process.exit(1);
}

evaluateInObsidian(expression)
	.then((value) => {
		console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
	})
	.catch((error) => {
		console.error("Evaluation failed:", error.message ?? error);
		process.exit(1);
	});
