// SDK errors expose status/data directly; older callers expose response instead.
export const httpStatus = (error) => error?.status ?? error?.response?.status ?? error?.originalError?.response?.status;
export const errorData = (error) => error?.data ?? error?.response?.data ?? error?.originalError?.response?.data ?? {};
export function sessionRejected(error) {
  const status = httpStatus(error), data = errorData(error);
  return status === 401 || (status === 403 && (data.extra_data?.reason === 'auth_required' || ['AUTH_REQUIRED', 'UNAUTHORIZED'].includes(data.code)));
}
export function companyGrantRejected(error) {
  const data = errorData(error);
  return httpStatus(error) === 401 && (data.code === 'COMPANY_ACCESS_REQUIRED' || ['Company code required', 'Company access removed'].includes(data.error));
}