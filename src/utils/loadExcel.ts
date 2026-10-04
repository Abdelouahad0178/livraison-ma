export async function loadExcel() {
  try {
    return await import('./excelLibrary')
  } catch (error) {
    console.error('Excel library unavailable:', error)
    alert("Impossible de charger l'export Excel. Verifiez votre connexion et reessayez.")
    return null
  }
}
