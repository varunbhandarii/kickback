"use client";
import dynamic from "next/dynamic";
const Studio = dynamic(() => import("./studio-panel"), { ssr: false, loading: () => <p>Loading dashboard…</p> });
export default function StudioLoader() { return <Studio />; }
