import { apiClient, extractApiErrorMessage } from './apiClient.js';

export async function registerUserApi(params) {
  try {
    const res = await apiClient.post('/auth/register', params);
    return res.data;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to create account.'));
  }
}

export async function loginUserApi(params) {
  try {
    const res = await apiClient.post('/auth/login', params);
    return res.data;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Invalid email or password.'));
  }
}

export async function fetchCurrentUserApi() {
  const res = await apiClient.get('/auth/me');
  return res.data.user;
}

export async function logoutUserApi() {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // Client-side JWT removal still completes sign-out cleanly
  }
}

export async function fetchReadingsApi(filters) {
  try {
    const res = await apiClient.get('/readings', {
      params: filters,
    });
    return res.data.readings;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to load blood glucose readings.'));
  }
}

export async function createReadingApi(params) {
  try {
    const res = await apiClient.post('/readings', params);
    return res.data.reading;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to save reading.'));
  }
}

export async function updateReadingApi(params) {
  try {
    const res = await apiClient.put(
      `/readings/${encodeURIComponent(params.readingId)}`,
      {
        value: params.value,
        note: params.note,
      }
    );
    return res.data.reading;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to update reading.'));
  }
}

export async function deleteReadingApi(readingId) {
  try {
    await apiClient.delete(`/readings/${encodeURIComponent(readingId)}`);
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to delete reading.'));
  }
}

export async function fetchDailyReportApi(date) {
  try {
    const res = await apiClient.get('/reports/daily', { params: { date } });
    return res.data;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to load daily report.'));
  }
}

export async function fetchMonthToDateReportApi(date) {
  try {
    const res = await apiClient.get('/reports/month-to-date', { params: { date } });
    return res.data;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to load month-to-date report.'));
  }
}

export async function fetchPreviousMonthReportApi(date) {
  try {
    const res = await apiClient.get('/reports/previous-month', { params: { date } });
    return res.data;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to load previous-month report.'));
  }
}

export async function fetchChatMessagesApi() {
  try {
    const res = await apiClient.get('/ai/chat');
    return res.data.messages;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to load chat history.'));
  }
}

export async function sendChatMessageApi(message) {
  try {
    const res = await apiClient.post('/ai/chat', { message });
    return res.data;
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Care Assistant could not respond.'));
  }
}

export async function clearChatMessagesApi() {
  try {
    await apiClient.delete('/ai/chat');
  } catch (err) {
    throw new Error(extractApiErrorMessage(err, 'Unable to clear chat history.'));
  }
}
