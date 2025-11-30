import { useState, useEffect } from 'react';
import { 
  Chip,
  Button,
  Modal,
  Spinner,
  Card,
  Separator
} from "@heroui/react";

interface Session {
  id: number;
  sessionId: string;
  title: string;
  endpointType: string;
  timestamp: string;
}

export const Sessions = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions?limit=20');
      const data = await res.json();
      setSessions(data.sessions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleViewSession = async (session: Session) => {
    setSelectedSession(session);
    setDetailsLoading(true);
    setIsOpen(true);
    try {
      const res = await fetch(`/api/sessions/${session.sessionId}`);
      const data = await res.json();
      setSessionDetails(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const getEndpointColor = (type: string) => {
    switch (type) {
      case 'simple-questions': return 'success';
      case 'detailed-questions': return 'primary';
      case 'auto-analyze': return 'warning';
      case 'pr-analyze': return 'secondary';
      default: return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Sessions Dashboard</h2>
        <Button variant="primary" onPress={fetchSessions} isPending={loading}>
          Refresh
        </Button>
      </div>

      <Card>
        <div className="flex flex-col divide-y divide-default-200">
          <div className="flex p-4 font-bold bg-default-100">
            <div className="w-1/4">TITLE</div>
            <div className="w-1/4">TYPE</div>
            <div className="w-1/4">TIMESTAMP</div>
            <div className="w-1/4">ACTIONS</div>
          </div>
          {loading ? (
             <div className="flex justify-center p-4"><Spinner /></div>
          ) : sessions.length === 0 ? (
             <div className="p-4 text-center text-default-500">No sessions found</div>
          ) : (
            sessions.map((item) => (
              <div key={item.sessionId} className="flex p-4 items-center hover:bg-default-50">
                <div className="w-1/4 font-medium">{item.title || "Untitled Session"}</div>
                <div className="w-1/4">
                  <Chip variant="secondary" size="sm" className={`bg-${getEndpointColor(item.endpointType)}-100 text-${getEndpointColor(item.endpointType)}-700`}>
                    {item.endpointType}
                  </Chip>
                </div>
                <div className="w-1/4 text-sm text-default-500">{new Date(item.timestamp).toLocaleString()}</div>
                <div className="w-1/4">
                    <Button size="sm" variant="secondary" onPress={() => handleViewSession(item)}>
                      View
                    </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Modal isOpen={isOpen} onOpenChange={setIsOpen} scroll="inside">
        <Modal.Container>
            <Modal.Dialog className="max-w-4xl w-full">
                <Modal.CloseTrigger />
                <Modal.Header className="flex flex-col gap-1">
                    <h3 className="text-lg font-bold">{selectedSession?.title}</h3>
                    <span className="text-xs font-normal text-default-500">
                    ID: {selectedSession?.sessionId}
                    </span>
                </Modal.Header>
                <Modal.Body>
                    {detailsLoading ? (
                    <div className="flex justify-center p-8">
                        <Spinner size="lg" />
                    </div>
                    ) : sessionDetails ? (
                    <div className="space-y-4">
                        {sessionDetails.questions.map((q: any, i: number) => (
                        <Card key={i} className="bg-default-50">
                            <div className="p-3 space-y-3">
                            <div>
                                <Chip size="sm" variant="secondary" className="bg-primary-100 text-primary-700">Question</Chip>
                                <p className="mt-2 font-medium">{q.question}</p>
                            </div>
                            <Separator/>
                            <div>
                                <Chip size="sm" variant="secondary" className="bg-success-100 text-success-700">Response</Chip>
                                <pre className="mt-2 text-xs whitespace-pre-wrap bg-black/10 p-2 rounded">
                                {JSON.stringify(JSON.parse(q.response), null, 2)}
                                </pre>
                            </div>
                            </div>
                        </Card>
                        ))}
                    </div>
                    ) : (
                    <p>Failed to load session details.</p>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onPress={() => setIsOpen(false)}>
                    Close
                    </Button>
                    <Button variant="primary" onPress={() => window.open(`/api/sessions/${selectedSession?.sessionId}/download`, '_blank')}>
                    Download JSON
                    </Button>
                </Modal.Footer>
            </Modal.Dialog>
        </Modal.Container>
      </Modal>
    </div>
  );
};

