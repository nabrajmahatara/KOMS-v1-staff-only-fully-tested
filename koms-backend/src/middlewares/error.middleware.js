import ApiError from '../utils/ApiError.js';

export function errorHandler(err, req, res, next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    error = new ApiError(statusCode, error.message || 'Internal Server Error', error.errors || []);
  }

  if (err.name === 'ValidationError') {
    error = new ApiError(400, 'Validation failed', Object.values(err.errors).map((e) => e.message));
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new ApiError(409, `${field} already exists`);
  }

  if (err.name === 'CastError') {
    error = new ApiError(400, `Invalid ${err.path}: ${err.value}`);
  }

  const isPublicRequest = req.originalUrl.startsWith('/api/public/');
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message,
    errors: error.errors,
    ...(process.env.NODE_ENV === 'development' && !isPublicRequest && { stack: err.stack }),
  });
}

export function notFound(req, res, next) {
  next(new ApiError(404, `Route not found - ${req.originalUrl}`));
}
