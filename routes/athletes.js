const express = require('express');
const router = express.Router();
const multer = require('multer');
const ctrl = require('../controllers/athleteController');

// Accept only xlsx/xls files, store in memory (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.xlsx?$/.test(file.originalname.toLowerCase()) ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel';
    if (ok) cb(null, true);
    else cb(new Error('Sadece .xlsx veya .xls dosyaları kabul edilir'));
  },
});

router.get('/', ctrl.getAthletes);
router.get('/:id', ctrl.getAthlete);
router.post('/', ctrl.createAthlete);
router.post('/import', upload.single('file'), ctrl.importAthletes);
router.put('/:id', ctrl.updateAthlete);
router.delete('/:id', ctrl.deleteAthlete);

module.exports = router;
