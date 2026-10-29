from PySide6.QtCore import QObject, QRunnable, QThreadPool, Signal


class Command:
    """Una acción del usuario. execute() corre fuera del hilo de la UI y nunca toca widgets."""

    def execute(self):
        raise NotImplementedError


class _Signals(QObject):
    succeeded = Signal(object)
    failed = Signal(object)


class _Task(QRunnable):
    def __init__(self, command, signals):
        super().__init__()
        self.command = command
        self.signals = signals

    def run(self):
        try:
            result = self.command.execute()
        except Exception as error:
            self.signals.failed.emit(error)
        else:
            self.signals.succeeded.emit(result)


class CommandInvoker:
    """Corre Commands en QThreadPool. on_success/on_failure deben ser slots de un QObject del hilo
    de la UI para que Qt los entregue en ese hilo."""

    def __init__(self):
        self._pending = set()

    def run(self, command, on_success, on_failure):
        signals = _Signals()
        signals.succeeded.connect(on_success)
        signals.failed.connect(on_failure)
        # Se guarda hasta que llegue la respuesta para que el GC no corte la señal en vuelo
        self._pending.add(signals)
        signals.succeeded.connect(lambda _: self._pending.discard(signals))
        signals.failed.connect(lambda _: self._pending.discard(signals))
        QThreadPool.globalInstance().start(_Task(command, signals))
