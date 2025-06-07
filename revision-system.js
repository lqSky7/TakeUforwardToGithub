// Spaced Repetition Algorithm for TUF+ Problems
class RevisionSystem {
  constructor() {
    this.baseIntervals = [1, 3, 7, 14, 30, 90]; // days
    this.storageKey = 'tuf_revision_data';
  }

  // Calculate revision interval directly based on mistakes and time
  calculateRevisionInterval(mistakes, timeInMinutes, revisionCount = 0) {
    // Base calculation: Start with mistakes as primary factor
    let baseDays;
    
    if (mistakes === 0) {
      baseDays = 7; // No mistakes = 1 week
    } else if (mistakes === 1) {
      baseDays = 3; // 1 mistake = 3 days
    } else if (mistakes === 2) {
      baseDays = 3; // 2 mistakes = 3 days
    } else if (mistakes >= 3 && mistakes <= 5) {
      baseDays = 3; // 3-5 mistakes = 3 days
    } else {
      baseDays = 1; // 6+ mistakes = 1 day (really struggling)
    }
    
    // Time modifier: Adjust based on how long it took
    if (timeInMinutes <= 2) {
      // Very fast solve - increase interval slightly
      baseDays = Math.ceil(baseDays * 1.2);
    } else if (timeInMinutes > 15) {
      // Very slow solve - decrease interval
      baseDays = Math.ceil(baseDays * 0.8);
    }
    // Normal time (2-15 min) - no change
    
    // Progressive intervals for repeated revisions
    if (revisionCount > 0) {
      const multipliers = [1, 1.5, 2, 3, 5, 7]; // Progressive multipliers
      const multiplier = multipliers[Math.min(revisionCount, multipliers.length - 1)];
      baseDays = Math.ceil(baseDays * multiplier);
    }
    
    // Cap at reasonable limits
    baseDays = Math.max(1, Math.min(baseDays, 90));
    
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + baseDays);
    return nextDate;
  }

  // Calculate difficulty score for display purposes only
  calculateDifficultyScore(mistakes, timeInMinutes) {
    let score = 0;
    
    // Mistakes scoring
    if (mistakes >= 6) score += 3;
    else if (mistakes >= 3) score += 2;
    else if (mistakes >= 1) score += 1;
    
    // Time scoring
    if (timeInMinutes > 15) score += 3;
    else if (timeInMinutes > 5) score += 2;
    else if (timeInMinutes > 2) score += 1;
    
    return score;
  }

  // Get difficulty level from score (for display only)
  getDifficultyLevel(score) {
    if (score <= 2) return 'easy';
    if (score <= 4) return 'medium';
    return 'hard';
  }

  // Add a new problem to revision tracking
  async addProblem(problemData) {
    const { name, link, mistakes, timeInMinutes, solvedDate = new Date() } = problemData;
    
    const difficultyScore = this.calculateDifficultyScore(mistakes, timeInMinutes);
    const difficultyLevel = this.getDifficultyLevel(difficultyScore);
    const nextRevisionDate = this.calculateRevisionInterval(mistakes, timeInMinutes);
    
    const problem = {
      id: this.generateId(),
      name,
      link,
      mistakes,
      timeInMinutes,
      solvedDate: solvedDate.toISOString(),
      difficultyLevel,
      difficultyScore,
      revisionCount: 0,
      nextRevisionDate: nextRevisionDate.toISOString(),
      lastRevisedDate: null,
      revisionHistory: []
    };
    
    const existingData = await this.getRevisionData();
    
    // Check if problem already exists (by link)
    const existingIndex = existingData.problems.findIndex(p => p.link === link);
    
    if (existingIndex !== -1) {
      // Update existing problem
      existingData.problems[existingIndex] = { ...existingData.problems[existingIndex], ...problem };
    } else {
      // Add new problem
      existingData.problems.push(problem);
    }
    
    await this.saveRevisionData(existingData);
    console.log('Problem added to revision system:', problem);
    
    return problem;
  }

  // Mark a revision as completed
  async completeRevision(problemId, wasEasy = true) {
    const data = await this.getRevisionData();
    const problem = data.problems.find(p => p.id === problemId);
    
    if (!problem) return null;
    
    const now = new Date();
    problem.lastRevisedDate = now.toISOString();
    problem.revisionHistory.push({
      date: now.toISOString(),
      wasEasy
    });
    
    if (wasEasy) {
      // Successful revision - increase interval
      problem.revisionCount += 1;
      problem.nextRevisionDate = this.calculateRevisionInterval(problem.mistakes, problem.timeInMinutes, problem.revisionCount).toISOString();
    } else {
      // Failed revision - reset to shorter interval
      problem.revisionCount = Math.max(0, problem.revisionCount - 1);
      problem.nextRevisionDate = this.calculateRevisionInterval(problem.mistakes, problem.timeInMinutes, 0).toISOString();
    }
    
    await this.saveRevisionData(data);
    return problem;
  }

  // Get problems due for revision
  async getProblemsForRevision() {
    const data = await this.getRevisionData();
    const now = new Date();
    
    return data.problems.filter(problem => {
      const revisionDate = new Date(problem.nextRevisionDate);
      return revisionDate <= now;
    }).sort((a, b) => new Date(a.nextRevisionDate) - new Date(b.nextRevisionDate));
  }

  // Get all problems with their revision status
  async getAllProblems() {
    const data = await this.getRevisionData();
    return data.problems.sort((a, b) => new Date(b.solvedDate) - new Date(a.solvedDate));
  }

  // Generate Google Calendar link
  generateCalendarLink(problem) {
    const startDate = new Date(problem.nextRevisionDate);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration
    
    const formatDate = (date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const title = `Review ${problem.name}`;
    const details = `Problem Link: ${problem.link}

Difficulty: ${problem.difficultyLevel}
Mistakes made: ${problem.mistakes}
Time taken: ${problem.timeInMinutes} minutes

Revision #${problem.revisionCount + 1}`;
    
    // Manually construct URL to avoid double encoding
    const baseUrl = 'https://calendar.google.com/calendar/render';
    const queryParams = [
      'action=TEMPLATE',
      `text=${encodeURIComponent(title)}`,
      `dates=${formatDate(startDate)}/${formatDate(endDate)}`,
      `details=${encodeURIComponent(details)}`,
      `location=${encodeURIComponent(problem.link)}`
    ];
    
    return `${baseUrl}?${queryParams.join('&')}`;
  }

  // Get revision statistics
  async getRevisionStats() {
    const data = await this.getRevisionData();
    const now = new Date();
    
    const totalProblems = data.problems.length;
    const dueForRevision = data.problems.filter(p => new Date(p.nextRevisionDate) <= now).length;
    const completedRevisions = data.problems.reduce((sum, p) => sum + p.revisionCount, 0);
    
    const difficultyBreakdown = data.problems.reduce((acc, p) => {
      acc[p.difficultyLevel] = (acc[p.difficultyLevel] || 0) + 1;
      return acc;
    }, {});
    
    return {
      totalProblems,
      dueForRevision,
      completedRevisions,
      difficultyBreakdown
    };
  }

  // Storage methods
  async getRevisionData() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKey], (result) => {
        resolve(result[this.storageKey] || { problems: [], lastUpdated: new Date().toISOString() });
      });
    });
  }

  async saveRevisionData(data) {
    data.lastUpdated = new Date().toISOString();
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: data }, resolve);
    });
  }

  // Clear all revision data
  async clearAllData() {
    return new Promise((resolve) => {
      chrome.storage.local.remove([this.storageKey], resolve);
    });
  }

  // Utility methods
  generateId() {
    return 'prob_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) return `${diffInWeeks}w ago`;
    
    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths}mo ago`;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return 'Today';
    }
    
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }
    
    const diffInDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));
    if (diffInDays > 0 && diffInDays <= 7) {
      return `In ${diffInDays} days`;
    }
    
    return date.toLocaleDateString();
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RevisionSystem;
}

// Global instance for browser extension
window.RevisionSystem = RevisionSystem;