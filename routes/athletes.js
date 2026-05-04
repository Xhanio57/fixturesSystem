const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/athleteController');

router.get('/', ctrl.getAthletes);
router.get('/:id', ctrl.getAthlete);
router.post('/', ctrl.createAthlete);
router.put('/:id', ctrl.updateAthlete);
router.delete('/:id', ctrl.deleteAthlete);

module.exports = router;
