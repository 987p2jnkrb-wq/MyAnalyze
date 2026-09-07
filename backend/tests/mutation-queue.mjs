import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { serializeApiMutations } from "../../backend-dist/middleware/mutationQueue.js";

class MockRequest extends EventEmitter {
  constructor(method = "POST") {
    super();
    this.method = method;
  }
  destroyed = false;
  aborted = false;
}

class MockResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  end() {
    this.writableEnded = true;
    this.emit("finish");
    return this;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET-y też muszą korzystać z tej samej kolejki, bo część z nich wykonuje
// maintenance writes na pojedynczym połączeniu SQLite.
const getA = new MockRequest("GET");
const getResA = new MockResponse();
let nextGetA = false;
await serializeApiMutations(getA, getResA, () => { nextGetA = true; });
assert.equal(nextGetA, true, "pierwszy GET nie otrzymał kolejki");

const getB = new MockRequest("GET");
const getResB = new MockResponse();
let nextGetB = false;
const waitingGetB = serializeApiMutations(getB, getResB, () => { nextGetB = true; });
await sleep(20);
assert.equal(nextGetB, false, "drugi GET ominął serializację dostępu do SQLite");
getResA.end();
await waitingGetB;
assert.equal(nextGetB, true, "drugi GET nie ruszył po zakończeniu pierwszego");
getResB.end();
await sleep(0);

// Node może oznaczyć request body jako destroyed po prawidłowym odczytaniu.
// Nie wolno traktować tego jak świadomego abortu klienta.
const requestA = new MockRequest();
requestA.destroyed = true;
const responseA = new MockResponse();
let nextA = false;
await serializeApiMutations(requestA, responseA, () => { nextA = true; });
assert.equal(nextA, true, "request z prawidłowo odczytanym body nie otrzymał kolejki");
responseA.end();
await sleep(0);

// Request rozłączony jeszcze podczas czekania nie może blokować kolejki.
const requestC = new MockRequest();
const responseC = new MockResponse();
let nextC = false;
await serializeApiMutations(requestC, responseC, () => { nextC = true; });
assert.equal(nextC, true);

const waitingRequest = new MockRequest();
const waitingResponse = new MockResponse();
let nextWaiting = false;
const waiting = serializeApiMutations(waitingRequest, waitingResponse, () => { nextWaiting = true; });
waitingRequest.aborted = true;
waitingResponse.destroyed = true;
waitingRequest.emit("aborted");
waitingResponse.emit("close");
responseC.end();
await waiting;
assert.equal(nextWaiting, false, "rozłączony request oczekujący na lock wykonał handler");

// P2 regression: rozłączenie PO zdobyciu locka nie może go zwolnić, dopóki
// server-side handler nie zakończy swojej pracy (res.end).
const activeRequest = new MockRequest();
const activeResponse = new MockResponse();
let nextActive = false;
await serializeApiMutations(activeRequest, activeResponse, () => { nextActive = true; });
assert.equal(nextActive, true);
activeRequest.aborted = true;
activeResponse.destroyed = true;
activeRequest.emit("aborted");
activeResponse.emit("close");

const afterAbortRequest = new MockRequest();
const afterAbortResponse = new MockResponse();
let nextAfterAbort = false;
const afterAbortWaiting = serializeApiMutations(afterAbortRequest, afterAbortResponse, () => { nextAfterAbort = true; });
await sleep(20);
assert.equal(nextAfterAbort, false, "aktywny abort za wcześnie zwolnił lock SQLite");
activeResponse.end();
await afterAbortWaiting;
assert.equal(nextAfterAbort, true, "lock nie został zwolniony po zakończeniu aktywnego handlera");
afterAbortResponse.end();

process.stdout.write("✓ kolejka API serializuje GET-y i bezpiecznie obsługuje abort requestu\n");
