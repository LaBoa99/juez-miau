from commands.base import Command


class LoadClarificationsCommand(Command):
    def __init__(self, service):
        self.service = service

    def execute(self):
        return self.service.list()


class AskClarificationCommand(Command):
    def __init__(self, service, problem_id, question):
        self.service = service
        self.problem_id = problem_id
        self.question = question

    def execute(self):
        return self.service.ask(self.problem_id, self.question)
