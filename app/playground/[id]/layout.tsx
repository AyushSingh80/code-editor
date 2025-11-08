import { SidebarProvider } from "@/components/ui/sidebar";
import React from "react";

function Playground({ children }: { children: React.ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

export default Playground;
