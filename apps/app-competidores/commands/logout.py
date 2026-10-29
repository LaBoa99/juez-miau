from commands.base import Command


class LogoutCommand(Command):
    def __init__(self, auth):
        self.auth = auth

    def execute(self):
        self.auth.logout()
