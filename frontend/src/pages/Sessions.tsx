import { useState, useEffect } from 'react';
import { 
  Table, 
  TableHeader, 
  TableColumn, 
  TableBody, 
  TableRow, 
  TableCell,
  Chip,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Spinner,
  Card,
  Divider
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
  const {isOpen, onOpen, onOpenChange} = useDisclosure();
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
    onOpen();
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
        <Button color="primary" onPress={fetchSessions} isLoading={loading}>
          Refresh
        </Button>
      </div>

      <Card>
        <Card.Body>
          <Table aria-label="Sessions table">
            <TableHeader>
              <TableColumn>TITLE</TableColumn>
              <TableColumn>TYPE</TableColumn>
              <TableColumn>TIMESTAMP</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody 
              emptyContent={loading ? <Spinner /> : "No sessions found"}
              items={sessions}
            >
              {(item) => (
                <TableRow key={item.sessionId}>
                  <TableCell>{item.title || "Untitled Session"}</TableCell>
                  <TableCell>
                    <Chip color={getEndpointColor(item.endpointType) as any} size="sm" variant="flat">
                      {item.endpointType}
                    </Chip>
                  </TableCell>
                  <TableCell>{new Date(item.timestamp).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button size="sm" color="primary" variant="light" onPress={() => handleViewSession(item)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card.Body>
      </Card>

      <Modal 
        isOpen={isOpen} 
        onOpenChange={onOpenChange} 
        size="4xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {selectedSession?.title}
                <span className="text-xs font-normal text-default-500">
                  ID: {selectedSession?.sessionId}
                </span>
              </ModalHeader>
              <ModalBody>
                {detailsLoading ? (
                  <div className="flex justify-center p-8">
                    <Spinner size="lg" />
                  </div>
                ) : sessionDetails ? (
                  <div className="space-y-4">
                    {sessionDetails.questions.map((q: any, i: number) => (
                      <Card key={i} className="bg-default-50">
                        <Card.Body className="space-y-3">
                          <div>
                            <Chip size="sm" color="primary" variant="dot">Question</Chip>
                            <p className="mt-2 font-medium">{q.question}</p>
                          </div>
                          <Divider/>
                          <div>
                            <Chip size="sm" color="success" variant="dot">Response</Chip>
                            <pre className="mt-2 text-xs whitespace-pre-wrap bg-black/10 p-2 rounded">
                              {JSON.stringify(JSON.parse(q.response), null, 2)}
                            </pre>
                          </div>
                        </Card.Body>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p>Failed to load session details.</p>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Close
                </Button>
                <Button color="primary" onPress={() => window.open(`/api/sessions/${selectedSession?.sessionId}/download`, '_blank')}>
                  Download JSON
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

