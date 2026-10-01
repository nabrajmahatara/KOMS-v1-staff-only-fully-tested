import { useEffect, useState } from "react";
import { listNotifications, markNotificationRead } from "../api/notification.api";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useLocation } from "react-router-dom";

function NotificationBell() {
  const { user } = useAuth();
  const socket = useSocket();
  const { pathname } = useLocation();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await listNotifications();
        if (!cancelled) setNotifications(response.data);
      } catch {
        // A notification failure should never block a staff page.
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!socket) return undefined;
    const handleNew = (notification) => {
      setNotifications((previous) => previous.some((entry) => entry._id === notification._id) ? previous : [notification, ...previous]);
    };
    socket.on("notification:new", handleNew);
    return () => socket.off("notification:new", handleNew);
  }, [socket]);

  if (!user || pathname === "/" || pathname === "/order" || pathname.startsWith("/order/")) return null;
  const unread = notifications.filter((notification) => !notification.isRead).length;
  const markRead = async (notification) => {
    if (notification.isRead) return;
    try {
      await markNotificationRead(notification._id);
      setNotifications((previous) => previous.map((entry) => entry._id === notification._id ? { ...entry, isRead: true } : entry));
    } catch {
      // Keep the notification visible if the read update fails.
    }
  };

  return <aside className="notification-bell" aria-label="Notifications"><button className="notification-trigger" type="button" onClick={() => setOpen((previous) => !previous)} aria-expanded={open}>Notifications{unread > 0 && <span className="notification-count">{unread}</span>}</button>{open && <section className="notification-dropdown"><h2>Notifications</h2>{notifications.length === 0 ? <p>No notifications yet.</p> : <ul>{notifications.slice(0, 10).map((notification) => <li key={notification._id} className={notification.isRead ? "" : "unread"}><button type="button" onClick={() => markRead(notification)}><strong>{notification.type === "ORDER_READY" ? "Order ready" : notification.type.replaceAll("_", " ")}</strong><span>{notification.message}</span></button></li>)}</ul>}</section>}</aside>;
}

export default NotificationBell;
