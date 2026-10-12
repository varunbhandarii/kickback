"use client";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
const data = { sources: [{ id: "transactions", data: [
  { merchant: "Rosa's Cafe", visits: 5, rewards: 2, date: "2026-10-11" },
  { merchant: "Bright Salon", visits: 3, rewards: 0, date: "2026-10-11" },
  { merchant: "Loaf Bakery", visits: 8, rewards: 4, date: "2026-10-11" },
] }] };
export default function StudioPanel() {
  return <AgStudioProvider licenseKey={process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY ?? ""}><div style={{ height: "75vh", width: "100%" }}><AgStudio data={data} mode="edit" /></div></AgStudioProvider>;
}
