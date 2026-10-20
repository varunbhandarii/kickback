"use client";
import { Icon } from "@/components/icons";
export default function PrintButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      <Icon name="printer" size={18} />
      Print sign
    </button>
  );
}
