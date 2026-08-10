import type { DeviceLifecycleStatus, DeviceSale } from "../../lib/sales";

export type DeviceRecord = {
  id: string;
  name: string;
  model: string;
  serial: string;
  grade: "A" | "B" | "C";
  score: number;
  batteryHealth: number;
  storageHealth: number;
  memory: string;
  storage: string;
  processor: string;
  testedAt: string;
  technician: string;
  warrantyEnds: string;
  status: "Published" | "Needs review" | "Draft";
  lifecycleStatus: DeviceLifecycleStatus;
  sale: DeviceSale | null;
};

export const devices: DeviceRecord[] = [
  {
    id: "DVP-LK-240831",
    name: "Lenovo ThinkPad T14 Gen 2",
    model: "20W0S4KD00",
    serial: "PF3K9L2A",
    grade: "A",
    score: 92,
    batteryHealth: 87,
    storageHealth: 98,
    memory: "16 GB DDR4",
    storage: "512 GB NVMe SSD",
    processor: "Intel Core i5-1135G7",
    testedAt: "10 Aug 2026, 01:42",
    technician: "Kasun Perera",
    warrantyEnds: "10 Feb 2027",
    status: "Published",
    lifecycleStatus: "Ready",
    sale: null,
  },
  {
    id: "DVP-LK-240830",
    name: "Dell Latitude 7420",
    model: "Latitude 7420",
    serial: "7H2Q1D3",
    grade: "A",
    score: 89,
    batteryHealth: 82,
    storageHealth: 97,
    memory: "16 GB DDR4",
    storage: "256 GB NVMe SSD",
    processor: "Intel Core i7-1185G7",
    testedAt: "09 Aug 2026, 16:18",
    technician: "Kasun Perera",
    warrantyEnds: "09 Feb 2027",
    status: "Published",
    lifecycleStatus: "Ready",
    sale: null,
  },
  {
    id: "DVP-LK-240829",
    name: "HP EliteBook 840 G7",
    model: "1C9P6AV",
    serial: "5CG1124KQJ",
    grade: "B",
    score: 78,
    batteryHealth: 74,
    storageHealth: 94,
    memory: "8 GB DDR4",
    storage: "256 GB NVMe SSD",
    processor: "Intel Core i5-10210U",
    testedAt: "09 Aug 2026, 13:05",
    technician: "Nadeesha Silva",
    warrantyEnds: "09 Nov 2026",
    status: "Needs review",
    lifecycleStatus: "Draft",
    sale: null,
  },
  {
    id: "DVP-LK-240828",
    name: "Apple MacBook Air M1",
    model: "A2337",
    serial: "FVFGQ81NQ6L4",
    grade: "A",
    score: 95,
    batteryHealth: 93,
    storageHealth: 99,
    memory: "8 GB Unified",
    storage: "256 GB SSD",
    processor: "Apple M1",
    testedAt: "08 Aug 2026, 10:31",
    technician: "Nadeesha Silva",
    warrantyEnds: "08 Feb 2027",
    status: "Published",
    lifecycleStatus: "Ready",
    sale: null,
  },
];

export function getDevice(id: string) {
  return devices.find((device) => device.id.toLowerCase() === id.toLowerCase()) ?? devices[0];
}
