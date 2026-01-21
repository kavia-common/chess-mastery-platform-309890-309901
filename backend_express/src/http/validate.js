const { ZodError } = require('zod');

// PUBLIC_INTERFACE
function validateBody(schema) {
  /** Express middleware factory validating req.body with a Zod schema. */
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation error',
          issues: err.issues,
        });
      }
      return next(err);
    }
  };
}

module.exports = { validateBody };
