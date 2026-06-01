import { Mail, MapPin, Phone, Smartphone, Truck } from 'lucide-react'

const INFO = {
  siege: 'N°19, Rue 5, Hay Tissir2 - Casablanca',
  tel1: '0522 62 92 89',
  tel2: '0661 97 86 12',
  email: 'bgexpress2019@gmail.com',
}

export default function CompanyContact() {
  return (
    <div className="bg-blue-700 text-white text-xs py-1.5 px-4 w-full">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-0.5">
        <span className="font-bold tracking-wide inline-flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" /> BG EXPRESS
        </span>
        <span className="text-blue-100 inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> {INFO.siege}
        </span>
        <span className="text-blue-100 inline-flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5" /> {INFO.tel1}
        </span>
        <span className="text-blue-100 inline-flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" /> {INFO.tel2}
        </span>
        <span className="text-blue-100 inline-flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5" /> {INFO.email}
        </span>
      </div>
    </div>
  )
}
