"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  LogOut,
  Rocket,
  Code,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { ProjectCard, ProjectListItem } from "@/components/project-card";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export type Project = {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive" | "archived";
  repo: string;
  createdAt: string;
  imageUrl: string;
  imageHint: string;
};

const mockProjectsData = [
  { id: "1", name: "QuantumLeap", description: "AI-powered data analysis platform.", status: "active" as const, createdAt: "2023-10-26T10:00:00Z" },
  { id: "2", name: "EcoTrack", description: "Sustainability and carbon footprint tracker.", status: "active" as const, createdAt: "2023-09-15T14:30:00Z" },
  { id: "3", name: "HealthSphere", description: "Decentralized patient record system.", status: "inactive" as const, createdAt: "2023-08-01T09:00:00Z" },
  { id: "4", name: "FinWiz", description: "Personal finance management application.", status: "active" as const, createdAt: "2023-11-05T18:00:00Z" },
  { id: "5", name: "CodeCollab", description: "Real-time collaborative coding environment.", status: "archived" as const, createdAt: "2022-12-20T11:45:00Z" },
  { id: "6", name: "Artify", description: "Generative art creation tool using AI.", status: "active" as const, createdAt: "2023-10-30T12:00:00Z" },
];

const imageMap = new Map(PlaceHolderImages.map(img => [img.id, img]));

const initialProjects: Project[] = mockProjectsData.map(p => {
    const img = imageMap.get(p.id);
    return {
        ...p,
        repo: `github.com/org/${p.name.toLowerCase().replace(/\s+/g, '-')}`,
        imageUrl: img?.imageUrl || `https://picsum.photos/seed/${p.id}/600/400`,
        imageHint: img?.imageHint || 'project new',
    };
});

export default function ProjectsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setProjects(initialProjects);
      setIsLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleLogout = async () => {
    await signOut(getFirebaseAuth());
    router.push("/login");
  };
  
  const handleProjectCreated = (newProject: Project) => {
    setProjects(prev => [newProject, ...prev]);
  };

  const filteredProjects = useMemo(() => {
    return projects
      .filter((project) =>
        project.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .filter(
        (project) => statusFilter === "all" || project.status === statusFilter
      );
  }, [projects, searchTerm, statusFilter]);
  
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2">
            <Rocket className="w-8 h-8 text-sidebar-primary" />
            <h1 className="text-xl font-bold font-headline">Copilot Projects</h1>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {/* Future navigation items can be added here */}
        </SidebarContent>
        <SidebarFooter>
          {user && (
            <div className="p-2 rounded-md bg-sidebar-accent">
              <div className="text-sm font-medium text-sidebar-accent-foreground">{user.displayName || user.email}</div>
              <div className="text-xs text-sidebar-accent-foreground/70">Welcome back!</div>
            </div>
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} className="w-full">
                <LogOut />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <main className="flex flex-col h-screen">
          <header className="flex shrink-0 items-center justify-between border-b border-border p-4 bg-background z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              <div className="relative w-full max-w-xs sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>

              <TooltipProvider>
                <div className="hidden sm:flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('grid')}>
                        <LayoutGrid className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Grid View</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
                        <List className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>List View</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>

              <CreateProjectDialog onProjectCreated={handleProjectCreated} />
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-4"}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        viewMode === 'grid' ? 
                        <Card key={i}><CardHeader><Skeleton className="h-24 w-full mb-4" /><Skeleton className="h-5 w-2/4" /></CardHeader><CardContent><div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div></CardContent><CardFooter><Skeleton className="h-8 w-24" /></CardFooter></Card> :
                        <div key={i} className="flex items-center space-x-4 p-3 border rounded-lg"><Skeleton className="h-14 w-14 rounded-md" /><div className="space-y-2 flex-1"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /></div><Skeleton className="h-6 w-20" /></div>
                    ))}
                </div>
            ) : filteredProjects.length > 0 ? (
                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-4"}>
                {filteredProjects.map((project) =>
                  viewMode === 'grid' ? <ProjectCard key={project.id} project={project} /> : <ProjectListItem key={project.id} project={project} />
                )}
              </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <Code className="h-16 w-16 mb-4" />
                    <h3 className="text-xl font-semibold text-foreground">No Projects Found</h3>
                    <p>No projects match your current search and filter criteria.</p>
                </div>
            )}
        </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
