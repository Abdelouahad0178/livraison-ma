const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = 3001

// Dossier pour stocker les archives
const ARCHIVES_DIR = path.join(__dirname, 'archives')

// Créer le dossier s'il n'existe pas
if (!fs.existsSync(ARCHIVES_DIR)) {
  fs.mkdirSync(ARCHIVES_DIR, { recursive: true })
}

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// Route de test
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Serveur d\'archivage actif',
    archivesDir: ARCHIVES_DIR
  })
})

// Route pour archiver des colis
app.post('/api/archive', (req, res) => {
  try {
    const { date, policy, count, parcels } = req.body

    if (!parcels || !Array.isArray(parcels)) {
      return res.status(400).json({ error: 'Données invalides' })
    }

    // Nom du fichier
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `archive_${timestamp}_${count}_colis.json`
    const filepath = path.join(ARCHIVES_DIR, filename)

    // Sauvegarder le fichier
    fs.writeFileSync(filepath, JSON.stringify({
      date,
      policy,
      count,
      parcels
    }, null, 2))

    console.log(`✅ Archivé: ${count} colis dans ${filename}`)

    res.json({
      success: true,
      path: filepath,
      filename,
      count: parcels.length
    })

  } catch (error) {
    console.error('❌ Erreur archivage:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Route pour lister les archives
app.get('/api/archives', (req, res) => {
  try {
    const files = fs.readdirSync(ARCHIVES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filepath = path.join(ARCHIVES_DIR, f)
        const stats = fs.statSync(filepath)
        return {
          filename: f,
          path: filepath,
          size: stats.size,
          createdAt: stats.birthtime
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt)

    res.json({ archives: files })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Route pour récupérer une archive
app.get('/api/archives/:filename', (req, res) => {
  try {
    const filepath = path.join(ARCHIVES_DIR, req.params.filename)

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Archive non trouvée' })
    }

    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Serveur d'Archivage Démarré! 🚀    ║
╠════════════════════════════════════════╣
║  Port: ${PORT}                          ║
║  URL:  http://localhost:${PORT}        ║
║  Archives: ${ARCHIVES_DIR}
╚════════════════════════════════════════╝
  `)
})
