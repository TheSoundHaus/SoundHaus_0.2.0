import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: string; // ISO8601 date string
}

export interface RecentProjectsData {
  projects: RecentProject[];
}

const MAX_PROJECTS = 8;

class RecentProjectsManager {
  private configDir: string;
  private configFile: string;

  constructor() {
    // Use ~/.soundhaus as the storage location
    this.configDir = path.join(app.getPath('home'), '.soundhaus');
    this.configFile = path.join(this.configDir, 'recent-projects.json');
  }

  /**
   * Ensure the config directory exists
   */
  private async ensureConfigDir(): Promise<void> {
    try {
      await fs.promises.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      console.error('[RecentProjectsManager] Failed to create config directory:', error);
      throw error;
    }
  }

  /**
   * Load recent projects from disk
   */
  async loadRecentProjects(): Promise<RecentProject[]> {
    try {
      await this.ensureConfigDir();
      const data = await fs.promises.readFile(this.configFile, 'utf8');
      const parsed: RecentProjectsData = JSON.parse(data);
      return parsed.projects || [];
    } catch (error) {
      // File doesn't exist or is invalid JSON - return empty array
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[RecentProjectsManager] Error loading recent projects:', error);
      }
      return [];
    }
  }

  /**
   * Save recent projects to disk
   */
  private async saveRecentProjects(projects: RecentProject[]): Promise<void> {
    try {
      await this.ensureConfigDir();
      const data: RecentProjectsData = { projects };
      await fs.promises.writeFile(this.configFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('[RecentProjectsManager] Failed to save recent projects:', error);
      throw error;
    }
  }

  /**
   * Add or update a project in the recent projects list
   * Moves it to the front (most recently used)
   */
  async addProject(projectPath: string, projectName: string): Promise<void> {
    try {
      let projects = await this.loadRecentProjects();

      // Remove if already exists (we'll add it to the front)
      projects = projects.filter(p => p.path !== projectPath);

      // Add to the front with current timestamp
      const newProject: RecentProject = {
        path: projectPath,
        name: projectName,
        lastOpened: new Date().toISOString(),
      };

      projects.unshift(newProject);

      // Enforce max limit
      if (projects.length > MAX_PROJECTS) {
        projects = projects.slice(0, MAX_PROJECTS);
      }

      await this.saveRecentProjects(projects);
    } catch (error) {
      console.error('[RecentProjectsManager] Failed to add project:', error);
      throw error;
    }
  }

  /**
   * Remove a project from the recent projects list
   */
  async removeProject(projectPath: string): Promise<void> {
    try {
      let projects = await this.loadRecentProjects();
      projects = projects.filter(p => p.path !== projectPath);
      await this.saveRecentProjects(projects);
    } catch (error) {
      console.error('[RecentProjectsManager] Failed to remove project:', error);
      throw error;
    }
  }

  /**
   * Get all recent projects
   */
  async getAllProjects(): Promise<RecentProject[]> {
    try {
      return await this.loadRecentProjects();
    } catch (error) {
      console.error('[RecentProjectsManager] Failed to get all projects:', error);
      return [];
    }
  }

  /**
   * Clear all recent projects
   */
  async clearAllProjects(): Promise<void> {
    try {
      await this.saveRecentProjects([]);
    } catch (error) {
      console.error('[RecentProjectsManager] Failed to clear projects:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const recentProjectsManager = new RecentProjectsManager();
