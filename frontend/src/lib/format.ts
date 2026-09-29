const fieldNameMap: Record<string, string> = {
  username: '사용자 아이디',
  password1: '비밀번호',
  password2: '비밀번호 확인',
  email: '이메일',
  first_name: '성',
  last_name: '이름',
};

export function formatApiError(err: unknown): string {
  if (!err) return '알 수 없는 오류가 발생했습니다.';

  const error = err as Record<string, unknown>;

  if (typeof error.detail === 'string') return error.detail;

  if (error.non_field_errors) {
    const arr = Array.isArray(error.non_field_errors) ? error.non_field_errors : [error.non_field_errors];
    return arr.map(String).join('\n');
  }

  const entries = Object.entries(error);
  if (entries.length > 0) {
    const lines: string[] = [];
    for (const [field, errors] of entries) {
      const name = fieldNameMap[field] || field.replace(/_/g, ' ').replace(/^[a-z]/, c => c.toUpperCase());
      const msgs = Array.isArray(errors) ? errors.map(String) : [String(errors)];
      for (const m of msgs) lines.push(`${name}: ${m}`);
    }
    return lines.join('\n');
  }
  return '요청을 처리하는 중 오류가 발생했습니다. 다시 시도해 주세요.';
}
