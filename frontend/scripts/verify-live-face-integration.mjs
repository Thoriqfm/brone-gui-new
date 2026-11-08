// Start backend on 8000 first. Uses the real HTTP/WebSocket transport and frontend store.
// Run from frontend: node scripts/verify-live-face-integration.mjs
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true }, appType: 'custom',
});
let dispose;
try {
    const { connectFaceSocket } = await server.ssrLoadModule('/src/services/websocketClient.ts');
    const { requestExpression } = await server.ssrLoadModule('/src/animation/expressionController.ts');
    const { useFaceStore } = await server.ssrLoadModule('/src/stores/faceStore.ts');
    const { EMOTIONS } = await server.ssrLoadModule('/src/schemas/faceMessages.ts');
    const waitFor = (predicate) => new Promise((resolve, reject) => {
        if (predicate(useFaceStore.getState())) return resolve();
        const unsubscribe = useFaceStore.subscribe(state => {
            if (predicate(state)) { clearTimeout(timer); unsubscribe(); resolve(); }
        });
        const timer = setTimeout(() => { unsubscribe(); reject(new Error('Frontend state update timed out')); }, 5000);
    });
    const send = (message) => fetch('http://127.0.0.1:8000/api/face/expression', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message),
    });
    const command = (emotion) => ({ type: 'SET_EXPRESSION', request_id: `live-${emotion}`,
        payload: { emotion, intensity: 0.7, transition_ms: 700 } });
    dispose = connectFaceSocket(requestExpression);
    await waitFor(state => state.connected);
    const defaultResponse = await send({ type: 'SET_EXPRESSION', request_id: 'live-defaults', payload: { emotion: 'happy' } });
    assert.equal(defaultResponse.status, 200);
    await waitFor(state => state.emotion === 'happy' && state.intensity === 1);
    assert.equal(useFaceStore.getState().transitionMs, 700);
    for (const emotion of EMOTIONS) {
        const response = await send(command(emotion));
        assert.equal(response.status, 200);
        await waitFor(state => state.emotion === emotion && state.intensity === 0.7);
        assert.equal(useFaceStore.getState().transitionMs, 700);
    }
    assert.equal((await send(command('unknown'))).status, 422);
    assert.equal(useFaceStore.getState().emotion, 'timeout');
    dispose();
    assert.equal(useFaceStore.getState().connected, false);
    // Backend retains a command while the display is offline.
    assert.equal((await send(command('sad'))).status, 200);
    dispose = connectFaceSocket(requestExpression);
    await waitFor(state => state.connected && state.emotion === 'sad');
    await send(command('idle'));
    await waitFor(state => state.emotion === 'idle');
    console.log('PASS: live HTTP defaults 1/700 -> complete WebSocket command -> frontend parser/controller/store, explicit overrides, 8 emotions, invalid rejection, reconnect snapshot.');
} finally {
    dispose?.();
    await server.close();
}
