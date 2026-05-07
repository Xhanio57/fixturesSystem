const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/matchController');

router.post('/draw/:categoryId', ctrl.runDraw);
router.get('/:categoryId', ctrl.getMatches);
router.put('/:matchId/winner', ctrl.setWinner);

module.exports = router;
