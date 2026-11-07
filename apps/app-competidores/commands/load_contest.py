from commands.base import Command


class LoadContestCommand(Command):
    def __init__(self, contest):
        self.contest = contest

    def execute(self):
        view = self.contest.load()
        view["problems"].sort(key=lambda p: p["letter"])
        return view


class LoadStatementPdfCommand(Command):
    def __init__(self, contest, problem_id):
        self.contest = contest
        self.problem_id = problem_id

    def execute(self):
        return self.problem_id, self.contest.statement_pdf(self.problem_id)
