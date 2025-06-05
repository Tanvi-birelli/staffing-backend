  if (typeof backendAttemptsLeft === "number") {
    setAttemptsLeft(backendAttemptsLeft);
  }

  if (backendLockExpiresAt) {
    const remainingLockTime = Math.ceil((backendLockExpiresAt - Date.now()) / 1000);
    setLockTimer(remainingLockTime);
    setIsAccountBlocked(true);
    localStorage.setItem(`otpLockExpiresAt_${email}`, backendLockExpiresAt);
  }
} finally {
  setLoading(false);
} 