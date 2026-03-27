namespace SampleApp.Auth
{
    public class LogoutService
    {
        private readonly ISessionManager _sessionManager;

        public LogoutService(ISessionManager sessionManager)
        {
            _sessionManager = sessionManager;
        }

        public void Logout()
        {
            _sessionManager.Invalidate();
        }
    }
}
