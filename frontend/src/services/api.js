const BASE_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:9092`;

/**
 * Common fetch wrapper for standardizing requests
 */
async function apiRequest(endpoint, params = {}, method = 'GET', body = null) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  if (method === 'GET') {
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  }

  const token = localStorage.getItem('pwms_auth_token');
  const options = {
    method,
    headers: { 
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (response.status === 401) {
    // Session expired or invalid - clear credentials and reload to force Login screen
    localStorage.removeItem('pwms_auth_token');
    window.location.reload();
  }
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'API request failed');
  }
  return response.json();
}

/**
 * Security & Authentication API calls
 */
export const authApi = {
  login: (username, password) => 
    apiRequest('/api/auth/login', {}, 'POST', { username, password }),
};

/**
 * Sleeves Department API calls
 */
export const sleevesApi = {
  getReport: (startDate, endDate) => 
    apiRequest('/api/sleeves/forming/report', { start_date: startDate, end_date: endDate }),
  
  getVarianceReport: (startDate, endDate, scope = "period", orderNo = null) => 
    apiRequest('/api/sleeves/forming/variance', { 
      start_date: startDate, 
      end_date: endDate, 
      vs_scope: scope,
      ...(orderNo && { order_no: orderNo })
    }),

  getBenchmarks: () => 
    apiRequest('/api/sleeves/forming/benchmarks'),
};

/**
 * Machine Learning API calls
 */
export const mlApi = {
  getStatus: () => 
    apiRequest('/api/ml/status'),
  
  predictWaste: (features) => 
    apiRequest('/api/ml/predict/waste', {}, 'POST', { features }),
};

/**
 * Printing Process API calls (within Sleeves Department)
 */
export const printingApi = {
  getBoppReport: (startDate, endDate) => 
    apiRequest('/api/sleeves/printing/bopp-monitor', { start_date: startDate, end_date: endDate }),

  getEfficiencyReport: (startDate, endDate) => 
    apiRequest('/api/sleeves/printing/efficiency', { start_date: startDate, end_date: endDate }),

  getBenchmarks: () => 
    apiRequest('/api/sleeves/printing/benchmarks'),
};

/**
 * PTS Back Order Intelligence API calls
 * Endpoints live under /api/sleeves/pts — separate from the printing module.
 */
export const ptsApi = {
  // Dashboard 1: All open back order lines with age-in-days and spec data
  getBackorderAge: () =>
    apiRequest('/api/sleeves/pts/backorder-age'),

  // Dashboard 2: Open back orders grouped by BOPP material (Micron × Width)
  getMaterialNeeds: () =>
    apiRequest('/api/sleeves/pts/material-needs'),

  // Dashboard 3: Back orders cross-referenced with open production orders
  getProductionCoverage: () =>
    apiRequest('/api/sleeves/pts/production-coverage'),

  // THE GUARDIAN: Real-time material integrity (Micron/Width mismatches)
  getLiveIntegrity: () =>
    apiRequest('/api/sleeves/pts/integrity/live-status'),
    
  // SALES ESTIMATOR: Dynamic lead time and material verification
  getEstimate: (data) =>
    apiRequest('/api/sleeves/pts/estimator/estimate', {}, 'POST', data),

  // LIVE FLOOR MONITOR: Track running machines and current jobs
  getLiveFloor: () =>
    apiRequest('/api/sleeves/pts/live-floor/status'),

  // DAILY PLAN: Persisted machine assignments
  getDailyPlan: () =>
    apiRequest('/api/sleeves/pts/daily-plan'),
    
  saveDailyPlan: (plan) =>
    apiRequest('/api/sleeves/pts/daily-plan', {}, 'POST', plan),

  // SLITTING ACTIVITY INTELLIGENCE
  getSlittingSummary: (filters = {}) =>
    apiRequest('/api/sleeves/pts/slitting/summary', filters),
};


/**
 * Labels Department API calls
 */
export const labelsApi = {
  getMaterialTargets: (startDate, endDate) => 
    apiRequest('/api/labels/material-targets', { start_date: startDate, end_date: endDate }),
    
  getMaterialUsage: (startDate, endDate) => 
    apiRequest('/api/labels/material-usage', { start_date: startDate, end_date: endDate }),
    
  getWasteByOrder: (startDate, endDate) => 
    apiRequest('/api/labels/waste-by-order', { start_date: startDate, end_date: endDate }),
    
  getSlittingActivity: (startDate, endDate) => 
    apiRequest('/api/labels/slitting-activity', { start_date: startDate, end_date: endDate }),
};

/**
 * System Notification API calls
 */
export const notificationsApi = {
  getDispatchHistory: () => 
    apiRequest('/api/notifications/dispatch'),
    
  createDispatchSignal: (data) => 
    apiRequest('/api/notifications/dispatch', {}, 'POST', data),
    
  updateDispatchStatus: (id, status, comments) => 
    apiRequest(`/api/notifications/dispatch/${id}`, {}, 'PATCH', { status, comments }),

  sendGeneric: (payload) => 
    apiRequest('/api/notifications/send', {}, 'POST', payload),
    
  archiveDispatches: (userName) =>
    apiRequest('/api/notifications/archive', {}, 'POST', { user: userName }),
};
