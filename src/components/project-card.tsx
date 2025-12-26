"use client";

import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/types/projects";
import { cn } from "@/lib/utils";
import { Github } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ProjectCardProps = {
  project: Project;
};

const statusClassNames: Record<Project['status'], string> = {
  active: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800',
  inactive: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  archived: 'bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Card className="flex flex-col overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1">
      <CardHeader className="p-0">
        <div className="aspect-video relative">
          <Image
            src={project.imageUrl}
            alt={project.name}
            fill
            className="object-cover rounded-t-lg"
            data-ai-hint={project.imageHint}
          />
        </div>
        <div className="p-6">
            <div className="flex justify-between items-start mb-2">
                <CardTitle className="font-headline text-lg">{project.name}</CardTitle>
                <Badge variant="outline" className={cn("capitalize", statusClassNames[project.status])}>
                    {project.status}
                </Badge>
            </div>
            <CardDescription>{project.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-grow px-6">
        <p className="text-sm text-muted-foreground font-code break-all">{project.repo}</p>
      </CardContent>
      <CardFooter className="flex justify-between items-center px-6">
        <span className="text-xs text-muted-foreground">
          Created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
        </span>
        <Button variant="ghost" size="sm" asChild>
          <a href={`https://${project.repo}`} target="_blank" rel="noopener noreferrer">
            <Github className="mr-2 h-4 w-4" />
            View Repo
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ProjectListItem({ project }: ProjectCardProps) {
    return (
        <div className="flex items-center space-x-4 p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors hover:border-accent">
            <Image 
                src={project.imageUrl}
                alt={project.name}
                width={56}
                height={56}
                className="rounded-md object-cover h-14 w-14"
                data-ai-hint={project.imageHint}
            />
            <div className="flex-1 space-y-1 min-w-0">
                <p className="text-sm font-medium leading-none font-headline truncate">{project.name}</p>
                <p className="text-sm text-muted-foreground truncate">{project.description}</p>
                <p className="text-xs text-muted-foreground font-code truncate">{project.repo}</p>
            </div>
            <div className="flex flex-col items-end gap-2 text-right w-32">
                <Badge variant="outline" className={cn("capitalize", statusClassNames[project.status])}>
                    {project.status}
                </Badge>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}
                </span>
            </div>
            <Button variant="outline" size="icon" className="shrink-0" asChild>
                <a href={`https://${project.repo}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${project.name} repository`}>
                    <Github className="h-4 w-4" />
                </a>
            </Button>
        </div>
    );
}
