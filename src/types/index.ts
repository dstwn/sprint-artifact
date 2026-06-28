export interface SprintArtifactConfig {
  version: number;
  googleDrive: {
    folderId: string;
    year: string;
    defaultFolderId?: string;
    brdId?: string;
    prdId?: string;
    planningId?: string;
  };
  selectedTask?: string;
  selectedTaskId?: string;
  selectedTaskFolderId?: string;
  selectedTaskType?: 'backlogs' | 'sprints';
  manifest?: Manifest;
}

export interface Manifest {
  lastSync: string;
  files: ManifestFile[];
}

export interface ManifestFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum?: string;
}

export interface AuthConfig {
  type: 'service_account' | 'oauth2';
  credentials: ServiceAccountCredentials | OAuth2Credentials;
}

export interface ServiceAccountCredentials {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

export interface OAuth2Credentials {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  refresh_token?: string;
  access_token?: string;
  token_expiry?: string;
}

export interface BacklogItem {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'in-progress' | 'done';
  sprint?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  goals: string[];
  backlogItems: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  backlogItemId: string;
  sprintId?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
}
