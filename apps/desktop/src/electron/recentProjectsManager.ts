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

/** Legacy single-file path before per-user sharding (still under ~/.soundhaus). */
const LEGACY_FILE_NAME = 'recent-projects.json';
const LEGACY_MIGRATED_NAME = 'recent-projects.json.migrated';

class RecentProjectsManager {
  private configDir: string;
  private recentProjectsDir: string;
  /** Supabase user UUID for the signed-in SoundHaus account; null when signed out. */
  private activeUserId: string | null = null;

  constructor() {
    this.configDir = path.join(app.getPath('home'), '.soundhaus');
    this.recentProjectsDir = path.join(this.configDir, 'recent-projects');
  }

  /**
   * Called from main on login / logout. Recent lists are keyed by this id on disk.
   */
  setActiveUserId(userId: string | null): void {
    this.activeUserId = userId && userId.trim() ? userId.trim() : null;
  }

  private getPerUserConfigPath(): string | null {
    if (!this.activeUserId) return null;
    return path.join(this.recentProjectsDir, `${this.activeUserId}.json`);
  }

  private getLegacyPath(): string {
    return path.join(this.configDir, LEGACY_FILE_NAME);
  }

  /**
   * If a pre-sharding recent-projects.json exists and this user has no file yet,
   * copy it once into the per-user file and rename the legacy file.
   */
  private async maybeMigrateLegacy(): Promise<void> {
    const userFile = this.getPerUserConfigPath();
    if (!userFile) return;

    try {
      if (fs.existsSync(userFile)) return;

      const legacyPath = this.getLegacyPath();
      if (!fs.existsSync(legacyPath)) return;

      const raw = await fs.promises.readFile(legacyPath, 'utf8');
      await fs.promises.mkdir(this.recentProjectsDir, { recursive: true });
      await fs.promises.writeFile(userFile, raw, 'utf8');

      const migratedPath = path.join(this.configDir, LEGACY_MIGRATED_NAME);
      await fs.promises.rename(legacyPath, migratedPath);
      console.log('[RecentProjectsManager] Migrated legacy recent-projects.json for user shard');
    } catch (error) {
      console.warn('[RecentProjectsManager] Legacy migration failed (non-fatal):', error);
    }
  }

  private async ensureStorageReady(): Promise<void> {
    await fs.promises.mkdir(this.configDir, { recursive: true });
    if (this.activeUserId) {
      await fs.promises.mkdir(this.recentProjectsDir, { recursive: true });
      await this.maybeMigrateLegacy();
    }
  }

  /**
   * Load recent projects from disk for the active user.
   */
  async loadRecentProjects(): Promise<RecentProject[]> {
    if (!this.activeUserId) {
      return [];
    }
    try {
      await this.ensureStorageReady();
      const configFile = this.getPerUserConfigPath();
      if (!configFile) return [];

      const data = await fs.promises.readFile(configFile, 'utf8');
      const parsed: RecentProjectsData = JSON.parse(data);
      return parsed.projects || [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[RecentProjectsManager] Error loading recent projects:', error);
      }
      return [];
    }
  }

  private async saveRecentProjects(projects: RecentProject[]): Promise<void> {
    if (!this.activeUserId) {
      return;
    }
    try {
      await this.ensureStorageReady();
      const configFile = this.getPerUserConfigPath();
      if (!configFile) return;

      const data: RecentProjectsData = { projects };
      await fs.promises.writeFile(configFile, JSON.stringify(data, null, 2), 'utf8');
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
    if (!this.activeUserId) {
      return;
    }
    try {
      let projects = await this.loadRecentProjects();

      projects = projects.filter(p => p.path !== projectPath);

      const newProject: RecentProject = {
        path: projectPath,
        name: projectName,
        lastOpened: new Date().toISOString(),
      };

      projects.unshift(newProject);

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
    if (!this.activeUserId) {
      return;
    }
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
   * Clear all recent projects for the active user
   */
  async clearAllProjects(): Promise<void> {
    if (!this.activeUserId) {
      return;
    }
    try {
      await this.saveRecentProjects([]);
    } catch (error) {
      console.error('[RecentProjectsManager] Failed to clear projects:', error);
      throw error;
    }
  }
}

export const recentProjectsManager = new RecentProjectsManager();
