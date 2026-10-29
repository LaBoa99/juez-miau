from commands.base import Command


class LoadContestCommand(Command):
    def __init__(self, contest):
        self.contest = contest

    def execute(self):
        view = self.contest.load()
        view["problems"].sort(key=lambda p: p["letter"])
        return view
