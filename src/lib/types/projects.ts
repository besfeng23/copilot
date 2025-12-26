export type Project = {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'archived';
  repo: string;
  createdAt: string;
  imageUrl: string;
  imageHint?: string;
};

