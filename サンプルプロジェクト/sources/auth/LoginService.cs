using System;
using System.Security.Cryptography;
using System.Text;

namespace SampleApp.Auth
{
    public class LoginService
    {
        private const int MaxFailCount = 5;
        private readonly IUserRepository _userRepository;

        public LoginService(IUserRepository userRepository)
        {
            _userRepository = userRepository;
        }

        /// <summary>ユーザー認証を行います。</summary>
        public bool Authenticate(string userId, string password)
        {
            if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(password))
                return false;

            var user = _userRepository.FindById(userId);
            if (user == null || user.LockFlag)
                return false;

            var hash = ComputeHash(password);
            if (user.PassHash == hash)
            {
                _userRepository.ResetFailCount(userId);
                return true;
            }

            var newCount = user.FailCount + 1;
            if (newCount >= MaxFailCount)
                LockAccount(userId);
            else
                _userRepository.IncrementFailCount(userId);

            return false;
        }

        public void LockAccount(string userId)
        {
            _userRepository.SetLockFlag(userId, true);
        }

        public bool IsAccountLocked(string userId)
        {
            var user = _userRepository.FindById(userId);
            return user?.LockFlag ?? false;
        }

        private static string ComputeHash(string input)
        {
            using var sha256 = SHA256.Create();
            var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
            return Convert.ToBase64String(bytes);
        }
    }
}
