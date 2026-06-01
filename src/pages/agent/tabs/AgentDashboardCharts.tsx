import { Bar, Line, Doughnut } from 'react-chartjs-2'
import '../../../utils/chartConfig' // Enregistre les composants Chart.js

interface ChartDataPoint { label: string; count: number }
interface PieDataPoint   { name: string; value: number; color: string }

interface AgentDashboardChartsProps {
  dashLast7:   ChartDataPoint[]
  dashLast30:  ChartDataPoint[]
  dashPieData: PieDataPoint[]
}

export default function AgentDashboardCharts({ dashLast7, dashLast30, dashPieData }: Readonly<AgentDashboardChartsProps>) {
  // ── Chart 1: Barres 7 jours ───
  const barData = {
    labels: dashLast7.map(d => d.label),
    datasets: [{
      label: 'Colis',
      data: dashLast7.map(d => d.count),
      backgroundColor: '#3b82f6',
      borderRadius: 6,
      barPercentage: 0.7,
    }],
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
        cornerRadius: 12,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#6b7280' },
      },
      y: {
        grid: { color: '#f3f4f6', drawBorder: false },
        ticks: { font: { size: 11 }, color: '#6b7280', stepSize: 1 },
      },
    },
  }

  // ── Chart 2: Ligne 30 jours ───
  const lineData = {
    labels: dashLast30.map(d => d.label),
    datasets: [{
      label: 'Colis',
      data: dashLast30.map(d => d.count),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
    }],
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
        cornerRadius: 12,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, color: '#6b7280', maxRotation: 0 },
      },
      y: {
        grid: { color: '#f3f4f6', drawBorder: false },
        ticks: { font: { size: 10 }, color: '#6b7280', stepSize: 1 },
      },
    },
  }

  // ── Chart 3: Donut ───
  const doughnutData = {
    labels: dashPieData.map(d => d.name),
    datasets: [{
      data: dashPieData.map(d => d.value),
      backgroundColor: dashPieData.map(d => d.color),
      borderWidth: 0,
    }],
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
        cornerRadius: 12,
      },
    },
    cutout: '60%',
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Colis crees - 7 derniers jours</h3>
        <div style={{ height: 180 }}>
          <Bar data={barData} options={barOptions} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Evolution - 30 jours</h3>
          <div style={{ height: 160 }}>
            <Line data={lineData} options={lineOptions} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Repartition des statuts</h3>
          {dashPieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <div style={{ width: 140, height: 140 }}>
                <Doughnut data={doughnutData} options={doughnutOptions} />
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                {dashPieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-gray-600 truncate">{d.name}</span>
                    <span className="ml-auto font-bold text-gray-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-300 text-sm">Aucun colis</div>
          )}
        </div>
      </div>
    </>
  )
}
