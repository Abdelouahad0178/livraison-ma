import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

// Enregistrer les composants Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export const CHART_COLORS = {
  crees:     '#3b82f6',
  livres:    '#10b981',
  retournes: '#ef4444',
  enCours:   '#f97316',
  revenue:   '#f59e0b',
  cod:       '#8b5cf6',
}

export const PIE_COLORS = [
  '#3b82f6','#10b981','#f97316','#ef4444','#8b5cf6',
  '#f59e0b','#06b6d4','#84cc16','#ec4899','#6366f1',
]

// Options par défaut pour tous les graphiques
export const defaultChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom' as const,
      labels: {
        padding: 12,
        font: { size: 11 },
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      padding: 12,
      titleFont: { size: 12, weight: 'bold' },
      bodyFont: { size: 11 },
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { font: { size: 11 }, color: '#9ca3af' },
    },
    y: {
      grid: { color: '#f0f0f0', drawBorder: false },
      ticks: { font: { size: 11 }, color: '#9ca3af' },
    },
  },
}

export const pieChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom' as const,
      labels: {
        padding: 8,
        font: { size: 11 },
        usePointStyle: true,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      padding: 12,
      titleFont: { size: 12, weight: 'bold' },
      bodyFont: { size: 11 },
      cornerRadius: 8,
    },
  },
}
