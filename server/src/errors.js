import { log } from "./log.js";
import { observeRequest } from "./metrics.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requestIdMiddleware(req, res, next) {
  req.requestId = req.headers["x-request-id"] || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader("x-request-id", req.requestId);
  next();
}

export function requestLogMiddleware(req, res, next) {
  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    const payload = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms,
      societyId: req.user?.societyId || null,
      role: req.user?.role || null,
    };
    observeRequest({ method: req.method, path: req.path, status: res.statusCode, ms });
    if (res.statusCode >= 500) log.error("http", payload);
    else if (res.statusCode >= 400) log.warn("http", payload);
    else log.info("http", payload);
  });
  next();
}

export function notFoundHandler(req, res) {
  res.status(404).json({ message: "Not found", requestId: req.requestId });
}

export function errorHandler(err, req, res, _next) {
  const status = Number(err.status || err.statusCode) || 500;
  const message = status >= 500 ? "Something went wrong." : err.message || "Request failed";
  log.error("unhandled", { requestId: req.requestId, status, err: err.message, stack: status >= 500 ? err.stack : undefined });
  res.status(status).json({ message, requestId: req.requestId });
}
