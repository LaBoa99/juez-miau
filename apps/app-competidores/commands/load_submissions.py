from commands.base import Command


class LoadSubmissionsCommand(Command):
    def __init__(self, service):
        self.service = service

    def execute(self):
        return self.service.list()
