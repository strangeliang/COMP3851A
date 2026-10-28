import { useParams } from 'react-router-dom';
import StudentLayout from '../../layouts/StudentLayout';
import SupportTickets from '../../components/SupportTickets';
import { useLanguage } from '../../state/LanguageContext';

export default function SupportPage() {
  const { ticketId } = useParams();
  const { language } = useLanguage();
  return <StudentLayout><h1>{language === 'zh' ? '我的支持工单' : 'My support requests'}</h1>
    <SupportTickets key={ticketId} initialTicketId={ticketId} />
  </StudentLayout>;
}
