function inviteError(value, uid, now) {
  if (!value) return new Error('없는 코드예요. 새 초대 코드를 받아 주세요.');
  if (value.member === uid) return new Error('본인의 초대 코드로는 연결할 수 없어요.');
  if (value.expiresAt <= now) return new Error('24시간이 지난 코드예요. 새 초대 코드를 받아 주세요.');
  if (value.claimedBy && value.claimedBy !== uid) return new Error('다른 트레이너가 사용한 코드예요.');
}

export async function claimInvite({read, write}, uid, now = Date.now) {
  const value = await read();
  const invalid = inviteError(value, uid, now());
  if (invalid) throw invalid;
  const claimed = {...value, claimedBy: uid};
  try {
    // The database rule atomically checks the current owner, expiry and claim.
    // An uncached transaction callback can receive null before any server read.
    await write(claimed);
  } catch (error) {
    if (/permission/i.test(error.code || error.message || '')) {
      const latest = await read();
      throw inviteError(latest, uid, now()) || new Error('트레이너 계정으로 로그인한 뒤 다시 연결해 주세요.');
    }
    throw error;
  }
  return claimed;
}
