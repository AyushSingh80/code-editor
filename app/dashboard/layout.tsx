import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getAllPlaygroundForUser } from "@/modules/dashboard/actions";
import { DashboardSidebar } from "@/modules/dashboard/components/dashboard-sidebar";

export default async function DashboardLayout({
    children
}:{
    children:React.ReactNode
}){
    const playground = await getAllPlaygroundForUser()
    const technologyIconMap: Record<string,string> = {
        REACT:"Zap",
        NEXTJS:"Lightbulb",
        EXPRESS:"Database",
        VUE:"Compass",
        HONO:"FlameIcon",
        ANGULAR:"Terminal"
    }
    const formattedPalyground = playground?.map((item)=> ({
        id: item.id,
        name:item.title,
        starred:item.StarMark?.[0]?.isMarked || false,
        icon:technologyIconMap[item.template] || "Code2"
    }))
return (
  <SidebarProvider>
    <DashboardSidebar initialPlaygroundData={formattedPalyground || []} />
    <SidebarInset>{children}</SidebarInset>
  </SidebarProvider>
);
}