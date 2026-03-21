// Yup validation middleware factory
const validate = (schema) => async (req, res, next) => {
  try {
    await schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    const errors = err.inner?.map(e => ({ field: e.path, message: e.message })) || [{ message: err.message }];
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }
};

module.exports = validate;
