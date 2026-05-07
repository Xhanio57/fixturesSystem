const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/categoryController');

router.get('/', ctrl.getCategories);
router.get('/:id', ctrl.getCategory);
router.post('/', ctrl.createCategory);
router.put('/:id', ctrl.updateCategory);
router.delete('/:id', ctrl.deleteCategory);
router.post('/:id/reset-draw', ctrl.resetDraw);

module.exports = router;
