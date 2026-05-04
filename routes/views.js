const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Athlete = require('../models/Athlete');

// Admin panel
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    const athletes = await Athlete.find()
      .populate('category', 'name drawStatus')
      .sort({ lastName: 1 });
    res.render('admin', { categories, athletes });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Live draw screen
router.get('/kura', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('draw', { categories });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Live draw screen with category slug
router.get('/kura/:slug', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('draw', { categories });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Spectator / Presentation Mode
router.get('/sunum', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('spectator', { categories });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Spectator with category slug
router.get('/sunum/:slug', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('spectator', { categories });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;
