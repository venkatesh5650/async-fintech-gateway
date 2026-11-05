"use client";

import { useParams } from "next/navigation";
import PlatformSection from "@/components/PlatformSection";

export default function PlatformSectionPage() {
  const params = useParams();
  const section = typeof params?.section === "string" ? params.section : "";
  return <PlatformSection section={section} />;
}
