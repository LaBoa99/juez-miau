from commands.base import Command


class LoadStandingsCommand(Command):
    def __init__(self, service, edition_id):
        self.service = service
        self.edition_id = edition_id

    def execute(self):
        return self.service.load(self.edition_id)
