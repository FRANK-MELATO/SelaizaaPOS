/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 5MB.'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: 'Unexpected file field.'
    });
  }

  // PostgreSQL errors
  if (err.code === '23505') {
    // Unique violation
    const detail = err.detail || '';
    let field = 'field';
    const match = detail.match(/Key \((.+?)\)/);
    if (match) field = match[1];
    return res.status(409).json({
      success: false,
      message: `Duplicate value: ${field} already exists.`
    });
  }

  if (err.code === '23503') {
    // Foreign key violation
    return res.status(400).json({
      success: false,
      message: 'Referenced record does not exist.'
    });
  }

  if (err.code === '23502') {
    // Not null violation
    return res.status(400).json({
      success: false,
      message: `Required field missing: ${err.column}`
    });
  }

  if (err.code === '22P02') {
    // Invalid input syntax
    return res.status(400).json({
      success: false,
      message: 'Invalid input format.'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired. Please log in again.'
    });
  }

  // Default error
  const statusCode = err.statusCode || err.status || 500;
  const response = {
    success: false,
    message: err.message || 'Internal server error'
  };

  if (err.errors) {
    response.errors = err.errors;
  }

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
