/**
 * Copyright (C) 2010-2014 Morgner UG (haftungsbeschränkt)
 *
 * This file is part of Structr <http://structr.org>.
 *
 * Structr is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * Structr is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Structr.  If not, see <http://www.gnu.org/licenses/>.
 */
package org.structr.web.common;

import java.util.Collection;
import java.util.LinkedList;
import java.util.List;
import static junit.framework.TestCase.assertEquals;
import static junit.framework.TestCase.assertTrue;
import static junit.framework.TestCase.fail;
import org.structr.common.AccessMode;
import org.structr.common.SecurityContext;
import org.structr.common.error.FrameworkException;
import org.structr.core.app.StructrApp;
import org.structr.core.entity.SchemaNode;
import org.structr.core.entity.relationship.SchemaRelationship;
import org.structr.core.graph.NodeAttribute;
import org.structr.core.graph.NodeInterface;
import org.structr.core.graph.Tx;
import org.structr.core.parser.Functions;
import org.structr.core.property.PropertyKey;
import org.structr.core.property.PropertyMap;
import org.structr.core.property.StringProperty;
import org.structr.schema.ConfigurationProvider;
import org.structr.schema.action.ActionContext;
import org.structr.web.entity.LinkSource;
import org.structr.web.entity.TestOne;
import org.structr.web.entity.User;
import org.structr.web.entity.dom.DOMElement;
import org.structr.web.entity.dom.DOMNode;
import org.structr.web.entity.dom.Page;
import org.w3c.dom.NodeList;

/**
 *
 * @author Christian Morgner
 */


public class RenderContextTest extends StructrUiTest {

	public void testVariableReplacementInDynamicTypes() {

		SchemaNode itemNode  = null;
		NodeInterface parent = null;
		NodeInterface child1 = null;
		NodeInterface child2 = null;

		try (final Tx tx = app.tx()) {

			itemNode = app.create(SchemaNode.class, new NodeAttribute(SchemaNode.name, "Item"));

			final PropertyMap properties = new PropertyMap();
			properties.put(SchemaRelationship.relationshipType, "CHILD");
			properties.put(SchemaRelationship.sourceMultiplicity, "1");
			properties.put(SchemaRelationship.targetMultiplicity, "*");
			properties.put(SchemaRelationship.sourceJsonName, "parentItem");
			properties.put(SchemaRelationship.targetJsonName, "children");

			app.create(itemNode, itemNode, SchemaRelationship.class, properties);

			// compile the stuff
			tx.success();

		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}

		final ConfigurationProvider config = StructrApp.getConfiguration();
		final Class itemClass              = config.getNodeEntityClass("Item");
		final PropertyKey childrenProperty = config.getPropertyKeyForJSONName(itemClass, "children");

		// create parent/child relationship
		try (final Tx tx = app.tx()) {

			parent = app.create(itemClass);
			child1 = app.create(itemClass);
			child2 = app.create(itemClass);

			final List<NodeInterface> children = new LinkedList<>();
			children.add(child1);
			children.add(child2);

			parent.setProperty(childrenProperty, children);

			tx.success();

		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}

		// verify that parent has two children
		try (final Tx tx = app.tx()) {

			// verify that parentItem can be accessed....
			final Object value = parent.getProperty(childrenProperty);

			assertTrue(value instanceof Collection);

			final Collection coll = (Collection)value;
			assertEquals("FUCK", 2, coll.size());

			tx.success();

		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}

		// check property access in template expressions
		try (final Tx tx = app.tx()) {

			assertEquals(parent.toString(), child1.replaceVariables(securityContext, new ActionContext(), "${this.parentItem}"));

			tx.success();


		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}


	}

	public void testFunctionEvaluationInDynamicTypes() {

		NodeInterface item  = null;

		try (final Tx tx = app.tx()) {

			app.create(SchemaNode.class,
				new NodeAttribute(SchemaNode.name, "Item"),
				new NodeAttribute(new StringProperty("_testMethodCalled"), "Boolean"),
				new NodeAttribute(new StringProperty("___testMethod"), "set(this, 'testMethodCalled', true)")
			);

			// compile the stuff
			tx.success();

		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}

		final ConfigurationProvider config = StructrApp.getConfiguration();
		final Class itemClass              = config.getNodeEntityClass("Item");

		// create parent/child relationship
		try (final Tx tx = app.tx()) {

			item = app.create(itemClass, new NodeAttribute(SchemaNode.name, "Item"));

			tx.success();

		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}

		// check property access in template expressions
		try (final Tx tx = app.tx()) {

			final RenderContext renderContext = new RenderContext();
			renderContext.putDataObject("item", item);

			assertEquals("Invalid combined array dot syntax result: ", "Item", item.replaceVariables(securityContext, renderContext, "${find('Item')[0].name}"));

			item.replaceVariables(securityContext, renderContext, "${item.testMethod()}");
			assertEquals("Invalid method evaluation result: ", "true", item.replaceVariables(securityContext, renderContext, "${item.testMethodCalled}"));

			tx.success();


		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}
	}

	public void testNotionTransformedPropertyAccess() {

		NodeInterface project = null;
		NodeInterface task1    = null;
		NodeInterface task2    = null;
		NodeInterface task3    = null;

		try (final Tx tx = app.tx()) {

			final SchemaNode projectNode = app.create(SchemaNode.class,
				new NodeAttribute(SchemaNode.name, "Project"),
				new NodeAttribute(new StringProperty("_taskList"), "Notion(tasks, id, name)"),
				new NodeAttribute(new StringProperty("_taskNames"), "Notion(tasks, name)")
			);

			final SchemaNode taskNode = app.create(SchemaNode.class,
				new NodeAttribute(SchemaNode.name, "Task")
			);

			// create schema relationship
			final PropertyMap taskProperties = new PropertyMap();
			taskProperties.put(SchemaRelationship.relationshipType, "TASK");
			taskProperties.put(SchemaRelationship.sourceMultiplicity, "1");
			taskProperties.put(SchemaRelationship.targetMultiplicity, "*");
			taskProperties.put(SchemaRelationship.sourceJsonName, "project");
			taskProperties.put(SchemaRelationship.targetJsonName, "tasks");

			app.create(projectNode, taskNode, SchemaRelationship.class, taskProperties);

			// create schema relationship
			final PropertyMap currentTaskProperties = new PropertyMap();
			currentTaskProperties.put(SchemaRelationship.relationshipType, "CURRENT");
			currentTaskProperties.put(SchemaRelationship.sourceMultiplicity, "1");
			currentTaskProperties.put(SchemaRelationship.targetMultiplicity, "1");
			currentTaskProperties.put(SchemaRelationship.sourceJsonName, "project");
			currentTaskProperties.put(SchemaRelationship.targetJsonName, "currentTask");

			app.create(projectNode, taskNode, SchemaRelationship.class, currentTaskProperties);

			// compile the stuff
			tx.success();

		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}

		final ConfigurationProvider config = StructrApp.getConfiguration();
		final Class projectClass           = config.getNodeEntityClass("Project");
		final Class taskClass              = config.getNodeEntityClass("Task");
		final PropertyKey currentTaskKey   = config.getPropertyKeyForJSONName(projectClass, "currentTask");
		final PropertyKey tasksKey         = config.getPropertyKeyForJSONName(projectClass, "tasks");

		// create parent/child relationship
		try (final Tx tx = app.tx()) {

			project = app.create(projectClass, new NodeAttribute(SchemaNode.name, "Project1"));
			task1    = app.create(taskClass, new NodeAttribute(SchemaNode.name, "Task1"));
			task2    = app.create(taskClass, new NodeAttribute(SchemaNode.name, "Task2"));
			task3    = app.create(taskClass, new NodeAttribute(SchemaNode.name, "Task3"));

			// add task to project
			final List tasks = new LinkedList<>();
			tasks.add(task1);
			tasks.add(task2);
			tasks.add(task3);
			project.setProperty(tasksKey, tasks);

			// set current task as well
			project.setProperty(currentTaskKey, task3);

			tx.success();

		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}

		// check property access in template expressions
		try (final Tx tx = app.tx()) {

			final RenderContext renderContext = new RenderContext();
			renderContext.putDataObject("project", project);
			renderContext.putDataObject("task", task1);

			assertEquals("Invalid dot syntax result: ", "Project1", project.replaceVariables(securityContext, renderContext, "${project.name}"));

			assertEquals("Invalid dot syntax result: ", "Task1", project.replaceVariables(securityContext, renderContext, "${project.tasks[0].name}"));
			assertEquals("Invalid dot syntax result: ", "Task2", project.replaceVariables(securityContext, renderContext, "${project.tasks[1].name}"));
			assertEquals("Invalid dot syntax result: ", "Task3", project.replaceVariables(securityContext, renderContext, "${project.tasks[2].name}"));

			assertEquals("Invalid dot syntax result: ", "[Task1, Task2, Task3]", project.replaceVariables(securityContext, renderContext, "${project.taskNames}"));
			assertEquals("Invalid dot syntax result: ", "Task1", project.replaceVariables(securityContext, renderContext, "${project.taskNames[0]}"));
			assertEquals("Invalid dot syntax result: ", "Task2", project.replaceVariables(securityContext, renderContext, "${project.taskNames[1]}"));
			assertEquals("Invalid dot syntax result: ", "Task3", project.replaceVariables(securityContext, renderContext, "${project.taskNames[2]}"));

			assertEquals("Invalid dot syntax result: ", "Task3", project.replaceVariables(securityContext, renderContext, "${project.currentTask.name}"));

			tx.success();


		} catch (FrameworkException fex) {

			fex.printStackTrace();

			fail("Unexpected exception");
		}
	}

	public void testVariableReplacement() {

		NodeInterface detailsDataObject = null;
		Page page                       = null;
		DOMNode html                    = null;
		DOMNode head                    = null;
		DOMNode body                    = null;
		DOMNode title                   = null;
		DOMNode h1                      = null;
		DOMNode div1                    = null;
		DOMNode p1                      = null;
		DOMNode div2                    = null;
		DOMNode p2                      = null;
		DOMNode div3                    = null;
		DOMNode p3                      = null;
		DOMNode a                       = null;
		DOMNode div4                    = null;
		DOMNode p4                      = null;

		try (final Tx tx = app.tx()) {

			detailsDataObject = app.create(TestOne.class, "TestOne");
			page              = Page.createNewPage(securityContext, "testpage");

			assertTrue(page != null);
			assertTrue(page instanceof Page);

			html  = (DOMNode) page.createElement("html");
			head  = (DOMNode) page.createElement("head");
			body  = (DOMNode) page.createElement("body");
			title = (DOMNode) page.createElement("title");
			h1    = (DOMNode) page.createElement("h1");
			div1  = (DOMNode) page.createElement("div");
			p1    = (DOMNode) page.createElement("p");
			div2  = (DOMNode) page.createElement("div");
			p2    = (DOMNode) page.createElement("p");
			div3  = (DOMNode) page.createElement("div");
			p3    = (DOMNode) page.createElement("p");
			a     = (DOMNode) page.createElement("a");
			div4  = (DOMNode) page.createElement("div");
			p4    = (DOMNode) page.createElement("p");

			// add HTML element to page
			page.appendChild(html);

			// add HEAD and BODY elements to HTML
			html.appendChild(head);
			html.appendChild(body);

			// add TITLE element to HEAD
			head.appendChild(title);

			// add H1 element to BODY
			body.appendChild(h1);

			// add DIV element 1 to BODY
			body.appendChild(div1);
			div1.appendChild(p1);

			// add DIV element 2 to DIV
			div1.appendChild(div2);
			div2.appendChild(p2);

			// add DIV element 3 to DIV
			div2.appendChild(div3);
			div3.appendChild(p3);

			// add link to p3
			p3.appendChild(a);
			a.setProperty(LinkSource.linkable, page);

			body.appendChild(div4);
			div4.appendChild(p4);

			p4.setProperty(DOMElement.restQuery, "/divs");
			p4.setProperty(DOMElement.dataKey, "div");

			NodeList paragraphs = page.getElementsByTagName("p");
			assertEquals(p1, paragraphs.item(0));
			assertEquals(p2, paragraphs.item(1));
			assertEquals(p3, paragraphs.item(2));
			assertEquals(p4, paragraphs.item(3));

			// create users
			final User tester1 = app.create(User.class, new NodeAttribute<>(User.name, "tester1"), new NodeAttribute<>(User.eMail, "tester1@test.com"));
			final User tester2 = app.create(User.class, new NodeAttribute<>(User.name, "tester2"), new NodeAttribute<>(User.eMail, "tester2@test.com"));

			assertNotNull("User tester1 should exist.", tester1);
			assertNotNull("User tester2 should exist.", tester2);

			tx.success();

		} catch (FrameworkException fex) {

			fail("Unexpected exception");
		}

		try (final Tx tx = app.tx()) {

			final RenderContext ctx = new RenderContext();
			ctx.setDetailsDataObject(detailsDataObject);
			ctx.setPage(page);

			// test for "empty" return value
			assertEquals("", p1.replaceVariables(securityContext, ctx, "${err}"));
			assertEquals("", p1.replaceVariables(securityContext, ctx, "${this.error}"));
			assertEquals("", p1.replaceVariables(securityContext, ctx, "${this.this.this.error}"));
			assertEquals("", p1.replaceVariables(securityContext, ctx, "${parent.error}"));
			assertEquals("", p1.replaceVariables(securityContext, ctx, "${this.owner}"));
			assertEquals("", p1.replaceVariables(securityContext, ctx, "${parent.owner}"));

			// other functions are tested in the ActionContextTest in structr-core, see there.
			assertEquals("true", p1.replaceVariables(securityContext, ctx, "${true}"));
			assertEquals("false", p1.replaceVariables(securityContext, ctx, "${false}"));
			assertEquals("yes", p1.replaceVariables(securityContext, ctx, "${if(true, \"yes\", \"no\")}"));
			assertEquals("no", p1.replaceVariables(securityContext, ctx, "${if(false, \"yes\", \"no\")}"));
			assertEquals("true", p1.replaceVariables(securityContext, ctx, "${if(true, true, false)}"));
			assertEquals("false", p1.replaceVariables(securityContext, ctx, "${if(false, true, false)}"));

			// test keywords
			assertEquals("${id} should evaluate to the ID if the current details object", detailsDataObject.getUuid(), p1.replaceVariables(securityContext, ctx, "${id}"));

			ctx.setDetailsDataObject(null);
			assertEquals("${id} should evaluate to the ID if the current details object", "abc12345", p1.replaceVariables(securityContext, ctx, "${id!abc12345}"));
			ctx.setDetailsDataObject(detailsDataObject);


			assertEquals("${id} should be equal to ${current.id}", "true", p1.replaceVariables(securityContext, ctx, "${equal(id, current.id)}"));
			assertEquals("${element} should evaluate to the current DOM node", p1.toString(), p1.replaceVariables(securityContext, ctx, "${element}"));

			assertNull(p1.replaceVariables(securityContext, ctx, "${if(true, null, \"no\")}"));
			assertNull(p1.replaceVariables(securityContext, ctx, "${null}"));

			assertEquals("Invalid replacement result", "/testpage?" + page.getUuid(), p1.replaceVariables(securityContext, ctx, "/${page.name}?${page.id}"));
			assertEquals("Invalid replacement result", "/testpage?" + page.getUuid(), a.replaceVariables(securityContext, ctx, "/${link.name}?${link.id}"));

			// these tests find single element => success
			assertEquals("Invalid replacement result", page.getUuid(), a.replaceVariables(securityContext, ctx, "${get(find('Page', 'name', 'testpage'), 'id')}"));
			assertEquals("Invalid replacement result", a.getUuid(), a.replaceVariables(securityContext, ctx, "${get(find('A'), 'id')}"));

			// this test finds multiple <p> elements => error
			assertEquals("Invalid replacement result", Functions.ERROR_MESSAGE_GET_ENTITY, a.replaceVariables(securityContext, ctx, "${get(find('P'), 'id')}"));

			// more complex replacement
			//assertEquals("Invalid replacement result", "", a.replaceVariables(securityContext, ctx, "${get(find('P'), 'id')}"));

			// String default value
			assertEquals("bar", p1.replaceVariables(securityContext, ctx, "${request.foo!bar}"));

			// Number default value (will be evaluated to a string)
			assertEquals("1", p1.replaceVariables(securityContext, ctx, "${page.position!1}"));

			// Number default value
			assertEquals("true", p1.replaceVariables(securityContext, ctx, "${equal(42, this.null!42)}"));


			final User tester1 = app.nodeQuery(User.class).andName("tester1").getFirst();
			final User tester2 = app.nodeQuery(User.class).andName("tester2").getFirst();

			assertNotNull("User tester1 should exist.", tester1);
			assertNotNull("User tester2 should exist.", tester2);

			final SecurityContext tester1Context = SecurityContext.getInstance(tester1, AccessMode.Backend);
			final SecurityContext tester2Context = SecurityContext.getInstance(tester2, AccessMode.Backend);

			// users
			assertEquals("tester1", p1.replaceVariables(tester1Context, ctx, "${me.name}"));
			assertEquals("tester2", p1.replaceVariables(tester2Context, ctx, "${me.name}"));

			tx.success();

		} catch (FrameworkException fex) {

			fail("Unexpected exception");
		}

	}
}
